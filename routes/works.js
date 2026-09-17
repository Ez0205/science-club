const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { canUpload } = require('../middleware/auth');

const router = express.Router();

// 配置文件上传
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    let dir = 'public/uploads/images/';
    if (file.mimetype.startsWith('video/')) {
      dir = 'public/uploads/videos/';
    }
    const fullPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    cb(null, fullPath);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function(req, file, cb) {
    const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
    const extname = path.extname(file.originalname).toLowerCase();
    
    if (file.mimetype.startsWith('image/')) {
      if (allowedImageTypes.test(extname)) {
        return cb(null, true);
      }
    } else if (file.mimetype.startsWith('video/') || extname === '.mp4') {
      if (extname === '.mp4') {
        return cb(null, true);
      }
    }
    cb(new Error('图片支持 JPG/PNG/GIF/WebP，视频仅支持 MP4 格式'));
  }
});

module.exports = function(db, logAction) {

  // 作品列表
  router.get('/works', (req, res) => {
    try {
      const category = req.query.category || '';
      const keyword = req.query.keyword || '';
      const page = parseInt(req.query.page) || 1;
      const perPage = 12;
      const offset = (page - 1) * perPage;
      
      let sql = `SELECT w.*, 
        (SELECT COUNT(*) FROM comments c WHERE c.work_id = w.id AND c.status = 'approved') as comment_count
        FROM works w WHERE w.status = 'published'`;
      let countSql = "SELECT COUNT(*) as count FROM works WHERE status = 'published'";
      let params = [];
      let countParams = [];
      
      if (category) {
        sql += ' AND w.category = ?';
        countSql += ' AND category = ?';
        params.push(category);
        countParams.push(category);
      }
      
      if (keyword) {
        sql += ' AND (w.title LIKE ? OR w.author LIKE ? OR w.summary LIKE ?)';
        countSql += ' AND (title LIKE ? OR author LIKE ? OR summary LIKE ?)';
        const kw = '%' + keyword + '%';
        params.push(kw, kw, kw);
        countParams.push(kw, kw, kw);
      }
      
      sql += ' ORDER BY w.created_at DESC LIMIT ? OFFSET ?';
      params.push(perPage, offset);
      
      const works = db.prepare(sql).all(...params);
      const total = db.prepare(countSql).get(...countParams).count;
      const totalPages = Math.ceil(total / perPage);
      
      const categories = ['物理', '化学', '生物', '工程', '天文', '其他'];
      
      res.render('works', {
        title: '实验作品库',
        works,
        categories,
        currentCategory: category,
        keyword,
        currentPage: page,
        totalPages,
        total,
        activeNav: '/works'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: '加载作品失败' });
    }
  });

  // 作品详情
  router.get('/works/:id', (req, res) => {
    try {
      const work = db.prepare('SELECT * FROM works WHERE id = ?').get(req.params.id);
      if (!work || work.status !== 'published') {
        return res.status(404).render('404', { title: '作品不存在' });
      }
      
      // 增加浏览量
      db.prepare('UPDATE works SET views = views + 1 WHERE id = ?').run(req.params.id);
      work.views = (work.views || 0) + 1;
      
      // 解析图片
      let images = [];
      if (work.images) {
        try {
          images = JSON.parse(work.images);
        } catch (e) {
          images = [];
        }
      }
      
      // 评论
      const comments = db.prepare(
        "SELECT * FROM comments WHERE work_id = ? AND status = 'approved' ORDER BY created_at DESC"
      ).all(req.params.id);
      
      // 相关作品
      const relatedWorks = db.prepare(`
        SELECT * FROM works 
        WHERE status = 'published' AND category = ? AND id != ? 
        ORDER BY created_at DESC LIMIT 4
      `).all(work.category, work.id);
      
      // 检查是否已点赞
      const hasLiked = req.session.user 
        ? db.prepare('SELECT COUNT(*) as count FROM likes WHERE work_id = ? AND user_id = ?').get(req.params.id, req.session.user.id).count > 0
        : false;
      
      res.render('work-detail', {
        title: work.title,
        work,
        images,
        comments,
        relatedWorks,
        hasLiked,
        activeNav: '/works'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: '加载作品失败' });
    }
  });

  // 投稿上传页面
  router.get('/submit', canUpload, (req, res) => {
    const categories = ['物理', '化学', '生物', '工程', '天文', '其他'];
    res.render('submit', {
      title: '作品投稿',
      categories,
      activeNav: '/submit',
      success: req.query.success || false,
      error: null
    });
  });

  // 提交作品
  router.post('/submit', canUpload, upload.fields([
    { name: 'cover_image', maxCount: 1 },
    { name: 'images', maxCount: 10 },
    { name: 'video', maxCount: 1 }
  ]), (req, res) => {
    try {
      const { title, category, author, class: className, summary, principle, reflection } = req.body;
      
      let coverImage = '';
      if (req.files['cover_image'] && req.files['cover_image'][0]) {
        coverImage = '/uploads/images/' + req.files['cover_image'][0].filename;
      }
      
      let images = [];
      if (req.files['images']) {
        images = req.files['images'].map(f => '/uploads/images/' + f.filename);
      }
      
      let videoUrl = '';
      if (req.files['video'] && req.files['video'][0]) {
        videoUrl = '/uploads/videos/' + req.files['video'][0].filename;
      }
      
      const isAdmin = req.session.user.role === 'admin';
      const status = isAdmin ? 'published' : 'pending';
      
      const result = db.prepare(`
        INSERT INTO works (title, category, author, class, summary, principle, reflection, 
          cover_image, video_url, images, status, uploader_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        title, category, author, className, summary, principle, reflection,
        coverImage, videoUrl, JSON.stringify(images), status, req.session.user.id
      );
      
      logAction(req, '上传作品', `作品ID: ${result.lastInsertRowid}`, title);
      
      const message = isAdmin ? '作品发布成功！' : '作品提交成功，等待老师审核后发布';
      res.redirect('/submit?success=' + encodeURIComponent(message));
    } catch (e) {
      console.error(e);
      res.render('submit', {
        title: '作品投稿',
        categories: ['物理', '化学', '生物', '工程', '天文', '其他'],
        activeNav: '/submit',
        error: '提交失败：' + e.message
      });
    }
  });

  // 点赞
  router.post('/works/:id/like', (req, res) => {
    try {
      const workId = req.params.id;
      const userId = req.session.user ? req.session.user.id : null;
      const ip = req.ip;
      
      // 检查是否已点赞
      let existing;
      if (userId) {
        existing = db.prepare('SELECT * FROM likes WHERE work_id = ? AND user_id = ?').get(workId, userId);
      } else {
        existing = db.prepare('SELECT * FROM likes WHERE work_id = ? AND ip_address = ?').get(workId, ip);
      }
      
      if (existing) {
        // 取消点赞
        db.prepare('DELETE FROM likes WHERE id = ?').run(existing.id);
        db.prepare('UPDATE works SET likes = likes - 1 WHERE id = ?').run(workId);
        res.json({ success: true, liked: false, likes: getLikesCount(db, workId) });
      } else {
        // 点赞
        db.prepare('INSERT INTO likes (work_id, user_id, ip_address) VALUES (?, ?, ?)').run(workId, userId, ip);
        db.prepare('UPDATE works SET likes = likes + 1 WHERE id = ?').run(workId);
        res.json({ success: true, liked: true, likes: getLikesCount(db, workId) });
      }
    } catch (e) {
      console.error(e);
      res.json({ success: false, message: e.message });
    }
  });

  // 发表评论
  router.post('/works/:id/comment', (req, res) => {
    try {
      const workId = req.params.id;
      const { author_name, content } = req.body;
      
      if (!author_name || !content) {
        return res.json({ success: false, message: '请填写昵称和评论内容' });
      }
      
      // 简单内容过滤
      const filteredContent = content
        .replace(/fuck|shit|傻逼|草泥马/gi, '***');
      
      const result = db.prepare(`
        INSERT INTO comments (work_id, author_name, content, status)
        VALUES (?, ?, ?, 'approved')
      `).run(workId, author_name.substring(0, 50), filteredContent.substring(0, 500));
      
      logAction(req, '发表评论', `作品ID: ${workId}`, content.substring(0, 100));
      
      res.json({ 
        success: true, 
        comment: {
          id: result.lastInsertRowid,
          author_name,
          content: filteredContent,
          created_at: new Date().toLocaleString('zh-CN')
        }
      });
    } catch (e) {
      console.error(e);
      res.json({ success: false, message: e.message });
    }
  });

  function getLikesCount(db, workId) {
    return db.prepare('SELECT likes FROM works WHERE id = ?').get(workId).likes || 0;
  }

  return router;
};
