const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { requireAdmin } = require('../middleware/auth');

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
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4/;
    const extname = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.test(extname)) {
      return cb(null, true);
    }
    cb(new Error('图片支持 JPG/PNG/GIF/WebP，视频仅支持 MP4 格式'));
  }
});

module.exports = function(db, logAction) {

  // 管理后台首页 - 仪表盘
  router.get('/', requireAdmin, (req, res) => {
    try {
      const stats = {
        totalWorks: db.prepare('SELECT COUNT(*) as count FROM works').get().count,
        publishedWorks: db.prepare("SELECT COUNT(*) as count FROM works WHERE status = 'published'").get().count,
        pendingWorks: db.prepare("SELECT COUNT(*) as count FROM works WHERE status = 'pending'").get().count,
        totalUsers: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
        teacherUsers: db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'teacher'").get().count,
        parentUsers: db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'parent'").get().count,
        totalComments: db.prepare('SELECT COUNT(*) as count FROM comments').get().count,
        totalLikes: db.prepare('SELECT COALESCE(SUM(likes), 0) as total FROM works').get().total,
        totalViews: db.prepare('SELECT COALESCE(SUM(views), 0) as total FROM works').get().total,
        totalMessages: db.prepare('SELECT COUNT(*) as count FROM messages').get().count,
      };
      
      // 最近作品
      const recentWorks = db.prepare(`
        SELECT w.*, u.real_name as uploader_name
        FROM works w 
        LEFT JOIN users u ON w.uploader_id = u.id
        ORDER BY w.created_at DESC 
        LIMIT 10
      `).all();
      
      // 最近操作日志
      const recentLogs = db.prepare(
        'SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT 15'
      ).all();
      
      // 按类别统计作品
      const categoryStats = db.prepare(`
        SELECT category, COUNT(*) as count 
        FROM works 
        WHERE status = 'published'
        GROUP BY category 
        ORDER BY count DESC
      `).all();
      
      res.render('admin/dashboard', {
        title: '管理后台',
        stats,
        recentWorks,
        recentLogs,
        categoryStats,
        activeNav: 'dashboard'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  // ========== 作品管理 ==========
  
  // 作品列表
  router.get('/works', requireAdmin, (req, res) => {
    try {
      const status = req.query.status || '';
      const keyword = req.query.keyword || '';
      
      let sql = `SELECT w.*, u.real_name as uploader_name 
        FROM works w LEFT JOIN users u ON w.uploader_id = u.id WHERE 1=1`;
      let params = [];
      
      if (status) {
        sql += ' AND w.status = ?';
        params.push(status);
      }
      
      if (keyword) {
        sql += ' AND (w.title LIKE ? OR w.author LIKE ?)';
        params.push('%' + keyword + '%', '%' + keyword + '%');
      }
      
      sql += ' ORDER BY w.created_at DESC';
      const works = db.prepare(sql).all(...params);
      
      res.render('admin/works', {
        title: '作品管理',
        works,
        currentStatus: status,
        keyword,
        activeNav: 'works'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  // 审核作品
  router.post('/works/:id/approve', requireAdmin, (req, res) => {
    try {
      db.prepare("UPDATE works SET status = 'published' WHERE id = ?").run(req.params.id);
      logAction(req, '审核通过', `作品ID: ${req.params.id}`, '');
      res.redirect('/admin/works');
    } catch (e) {
      res.redirect('/admin/works?error=' + encodeURIComponent(e.message));
    }
  });

  // 驳回作品
  router.post('/works/:id/reject', requireAdmin, (req, res) => {
    try {
      const reason = req.body.reason || '';
      db.prepare("UPDATE works SET status = 'rejected', reject_reason = ? WHERE id = ?").run(reason, req.params.id);
      logAction(req, '驳回作品', `作品ID: ${req.params.id}`, reason);
      res.redirect('/admin/works');
    } catch (e) {
      res.redirect('/admin/works?error=' + encodeURIComponent(e.message));
    }
  });

  // 删除作品
  router.post('/works/:id/delete', requireAdmin, (req, res) => {
    try {
      db.prepare('DELETE FROM works WHERE id = ?').run(req.params.id);
      logAction(req, '删除作品', `作品ID: ${req.params.id}`, '');
      res.redirect('/admin/works');
    } catch (e) {
      res.redirect('/admin/works?error=' + encodeURIComponent(e.message));
    }
  });

  // 设为精选/取消精选
  router.post('/works/:id/feature', requireAdmin, (req, res) => {
    try {
      const work = db.prepare('SELECT is_featured FROM works WHERE id = ?').get(req.params.id);
      const newVal = work.is_featured ? 0 : 1;
      db.prepare('UPDATE works SET is_featured = ? WHERE id = ?').run(newVal, req.params.id);
      logAction(req, newVal ? '设为精选' : '取消精选', `作品ID: ${req.params.id}`, '');
      res.redirect('/admin/works');
    } catch (e) {
      res.redirect('/admin/works?error=' + encodeURIComponent(e.message));
    }
  });

  // 编辑作品页面
  router.get('/works/:id/edit', requireAdmin, (req, res) => {
    try {
      const work = db.prepare('SELECT * FROM works WHERE id = ?').get(req.params.id);
      if (!work) return res.status(404).render('404', { title: '作品不存在' });
      
      let images = [];
      if (work.images) {
        try { images = JSON.parse(work.images); } catch (e) {}
      }
      
      const categories = ['物理', '化学', '生物', '工程', '天文', '其他'];
      
      res.render('admin/work-edit', {
        title: '编辑作品',
        work,
        images,
        categories,
        activeNav: 'works'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  // 保存作品编辑
  router.post('/works/:id/edit', requireAdmin, upload.fields([
    { name: 'cover_image', maxCount: 1 },
    { name: 'images', maxCount: 10 },
    { name: 'video', maxCount: 1 }
  ]), (req, res) => {
    try {
      const { title, category, author, class: className, summary, principle, reflection, status } = req.body;
      
      // 获取现有作品
      const work = db.prepare('SELECT * FROM works WHERE id = ?').get(req.params.id);
      
      let coverImage = work.cover_image;
      if (req.files['cover_image'] && req.files['cover_image'][0]) {
        coverImage = '/uploads/images/' + req.files['cover_image'][0].filename;
      }
      
      let images = [];
      if (work.images) {
        try { images = JSON.parse(work.images); } catch (e) {}
      }
      if (req.files['images']) {
        const newImages = req.files['images'].map(f => '/uploads/images/' + f.filename);
        images = [...images, ...newImages];
      }
      
      let videoUrl = work.video_url;
      if (req.files['video'] && req.files['video'][0]) {
        videoUrl = '/uploads/videos/' + req.files['video'][0].filename;
      }
      
      db.prepare(`
        UPDATE works SET title=?, category=?, author=?, class=?, summary=?, 
          principle=?, reflection=?, cover_image=?, video_url=?, images=?, status=?
        WHERE id=?
      `).run(
        title, category, author, className, summary, principle, reflection,
        coverImage, videoUrl, JSON.stringify(images), status, req.params.id
      );
      
      logAction(req, '编辑作品', `作品ID: ${req.params.id}`, title);
      res.redirect('/admin/works');
    } catch (e) {
      console.error(e);
      res.redirect('/admin/works?error=' + encodeURIComponent(e.message));
    }
  });

  // 批量操作
  router.post('/works/batch', requireAdmin, (req, res) => {
    try {
      const { action, ids } = req.body;
      if (!ids || !Array.isArray(ids)) {
        return res.redirect('/admin/works');
      }
      
      const placeholders = ids.map(() => '?').join(',');
      
      if (action === 'approve') {
        db.prepare(`UPDATE works SET status = 'published' WHERE id IN (${placeholders})`).run(...ids);
        logAction(req, '批量审核通过', `作品数: ${ids.length}`, '');
      } else if (action === 'feature') {
        db.prepare(`UPDATE works SET is_featured = 1 WHERE id IN (${placeholders})`).run(...ids);
        logAction(req, '批量设为精选', `作品数: ${ids.length}`, '');
      } else if (action === 'delete') {
        db.prepare(`DELETE FROM works WHERE id IN (${placeholders})`).run(...ids);
        logAction(req, '批量删除', `作品数: ${ids.length}`, '');
      }
      
      res.redirect('/admin/works');
    } catch (e) {
      res.redirect('/admin/works?error=' + encodeURIComponent(e.message));
    }
  });

  // ========== 评论管理 ==========
  
  router.get('/comments', requireAdmin, (req, res) => {
    try {
      const comments = db.prepare(`
        SELECT c.*, w.title as work_title 
        FROM comments c 
        LEFT JOIN works w ON c.work_id = w.id 
        ORDER BY c.created_at DESC
      `).all();
      
      res.render('admin/comments', {
        title: '评论管理',
        comments,
        activeNav: 'comments'
      });
    } catch (e) {
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  router.post('/comments/:id/delete', requireAdmin, (req, res) => {
    try {
      db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
      logAction(req, '删除评论', `评论ID: ${req.params.id}`, '');
      res.redirect('/admin/comments');
    } catch (e) {
      res.redirect('/admin/comments?error=' + encodeURIComponent(e.message));
    }
  });

  // ========== 投票管理 ==========
  
  router.get('/votes', requireAdmin, (req, res) => {
    try {
      const votes = db.prepare('SELECT * FROM votes ORDER BY created_at DESC').all();
      
      const votesWithCandidates = votes.map(vote => {
        const candidates = db.prepare(`
          SELECT vc.*, w.title 
          FROM vote_candidates vc 
          JOIN works w ON vc.work_id = w.id 
          WHERE vc.vote_id = ?
        `).all(vote.id);
        return { ...vote, candidates };
      });
      
      res.render('admin/votes', {
        title: '投票管理',
        votes: votesWithCandidates,
        activeNav: 'votes'
      });
    } catch (e) {
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  // 新建投票页面
  router.get('/votes/new', requireAdmin, (req, res) => {
    try {
      const works = db.prepare("SELECT id, title FROM works WHERE status = 'published' ORDER BY created_at DESC").all();
      res.render('admin/vote-new', {
        title: '新建投票',
        works,
        activeNav: 'votes'
      });
    } catch (e) {
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  // 创建投票
  router.post('/votes/new', requireAdmin, (req, res) => {
    try {
      const { title, description, start_date, end_date, work_ids } = req.body;
      
      const result = db.prepare(`
        INSERT INTO votes (title, description, start_date, end_date, is_active)
        VALUES (?, ?, ?, ?, 1)
      `).run(title, description, start_date, end_date);
      
      const voteId = result.lastInsertRowid;
      
      if (work_ids && Array.isArray(work_ids)) {
        const insertCandidate = db.prepare(
          'INSERT INTO vote_candidates (vote_id, work_id, vote_count) VALUES (?, ?, 0)'
        );
        for (const wid of work_ids) {
          insertCandidate.run(voteId, wid);
        }
      }
      
      logAction(req, '创建投票', `投票ID: ${voteId}`, title);
      res.redirect('/admin/votes');
    } catch (e) {
      res.redirect('/admin/votes?error=' + encodeURIComponent(e.message));
    }
  });

  // 关闭投票
  router.post('/votes/:id/close', requireAdmin, (req, res) => {
    try {
      db.prepare('UPDATE votes SET is_active = 0 WHERE id = ?').run(req.params.id);
      logAction(req, '关闭投票', `投票ID: ${req.params.id}`, '');
      res.redirect('/admin/votes');
    } catch (e) {
      res.redirect('/admin/votes?error=' + encodeURIComponent(e.message));
    }
  });

  // 删除投票
  router.post('/votes/:id/delete', requireAdmin, (req, res) => {
    try {
      db.prepare('DELETE FROM votes WHERE id = ?').run(req.params.id);
      logAction(req, '删除投票', `投票ID: ${req.params.id}`, '');
      res.redirect('/admin/votes');
    } catch (e) {
      res.redirect('/admin/votes?error=' + encodeURIComponent(e.message));
    }
  });

  // ========== 问答管理 ==========
  
  router.get('/quiz', requireAdmin, (req, res) => {
    try {
      const questions = db.prepare('SELECT * FROM quiz_questions ORDER BY is_weekly DESC, id DESC').all();
      res.render('admin/quiz', {
        title: '问答管理',
        questions,
        activeNav: 'quiz'
      });
    } catch (e) {
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  router.get('/quiz/new', requireAdmin, (req, res) => {
    res.render('admin/quiz-new', {
      title: '新增题目',
      activeNav: 'quiz'
    });
  });

  router.post('/quiz/new', requireAdmin, (req, res) => {
    try {
      const { question, type, options, correct_answer, explanation, is_weekly } = req.body;
      
      let optionsJson = '';
      if (type === 'choice' && options) {
        optionsJson = JSON.stringify(options.filter(o => o.trim()));
      }
      
      // 如果设为每周一题，取消其他题的每周一题标记
      if (is_weekly) {
        db.prepare('UPDATE quiz_questions SET is_weekly = 0 WHERE is_weekly = 1').run();
      }
      
      db.prepare(`
        INSERT INTO quiz_questions (question, type, options, correct_answer, explanation, is_weekly)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(question, type, optionsJson, correct_answer, explanation, is_weekly ? 1 : 0);
      
      logAction(req, '新增问答题目', '', question.substring(0, 50));
      res.redirect('/admin/quiz');
    } catch (e) {
      res.redirect('/admin/quiz?error=' + encodeURIComponent(e.message));
    }
  });

  router.post('/quiz/:id/delete', requireAdmin, (req, res) => {
    try {
      db.prepare('DELETE FROM quiz_questions WHERE id = ?').run(req.params.id);
      logAction(req, '删除题目', `题目ID: ${req.params.id}`, '');
      res.redirect('/admin/quiz');
    } catch (e) {
      res.redirect('/admin/quiz?error=' + encodeURIComponent(e.message));
    }
  });

  // ========== 留言管理 ==========
  
  router.get('/messages', requireAdmin, (req, res) => {
    try {
      const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all();
      res.render('admin/messages', {
        title: '留言管理',
        messages,
        activeNav: 'messages'
      });
    } catch (e) {
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  // 回复留言
  router.post('/messages/:id/reply', requireAdmin, (req, res) => {
    try {
      db.prepare('UPDATE messages SET reply = ? WHERE id = ?').run(req.body.reply, req.params.id);
      logAction(req, '回复留言', `留言ID: ${req.params.id}`, req.body.reply.substring(0, 50));
      res.redirect('/admin/messages');
    } catch (e) {
      res.redirect('/admin/messages?error=' + encodeURIComponent(e.message));
    }
  });

  router.post('/messages/:id/delete', requireAdmin, (req, res) => {
    try {
      db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
      logAction(req, '删除留言', `留言ID: ${req.params.id}`, '');
      res.redirect('/admin/messages');
    } catch (e) {
      res.redirect('/admin/messages?error=' + encodeURIComponent(e.message));
    }
  });

  // ========== 页面编辑 ==========
  
  router.get('/pages', requireAdmin, (req, res) => {
    try {
      const settings = db.prepare('SELECT * FROM site_settings').all();
      const settingsObj = {};
      for (const s of settings) {
        settingsObj[s.key_name] = s.value;
      }
      
      const banners = db.prepare('SELECT * FROM banners ORDER BY sort_order ASC, id DESC').all();
      const announcements = db.prepare('SELECT * FROM announcements ORDER BY sort_order ASC, id DESC').all();
      
      res.render('admin/pages', {
        title: '页面编辑',
        settings: settingsObj,
        banners,
        announcements,
        activeNav: 'pages'
      });
    } catch (e) {
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  // 保存网站设置
  router.post('/pages/settings', requireAdmin, (req, res) => {
    try {
      const settings = req.body;
      const upsert = db.prepare(`
        INSERT INTO site_settings (key_name, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key_name) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `);
      
      for (const [key, value] of Object.entries(settings)) {
        upsert.run(key, value);
      }
      
      logAction(req, '编辑网站设置', '', '');
      res.redirect('/admin/pages');
    } catch (e) {
      res.redirect('/admin/pages?error=' + encodeURIComponent(e.message));
    }
  });

  // 添加轮播图
  router.post('/pages/banner', requireAdmin, upload.single('image'), (req, res) => {
    try {
      const { title, link_url, sort_order } = req.body;
      let imageUrl = '';
      if (req.file) {
        imageUrl = '/uploads/images/' + req.file.filename;
      }
      
      db.prepare(`
        INSERT INTO banners (title, image_url, link_url, sort_order, is_active)
        VALUES (?, ?, ?, ?, 1)
      `).run(title, imageUrl, link_url, sort_order || 0);
      
      logAction(req, '添加轮播图', '', title);
      res.redirect('/admin/pages');
    } catch (e) {
      res.redirect('/admin/pages?error=' + encodeURIComponent(e.message));
    }
  });

  // 删除轮播图
  router.post('/pages/banner/:id/delete', requireAdmin, (req, res) => {
    try {
      db.prepare('DELETE FROM banners WHERE id = ?').run(req.params.id);
      logAction(req, '删除轮播图', `轮播图ID: ${req.params.id}`, '');
      res.redirect('/admin/pages');
    } catch (e) {
      res.redirect('/admin/pages?error=' + encodeURIComponent(e.message));
    }
  });

  // 添加公告
  router.post('/pages/announcement', requireAdmin, (req, res) => {
    try {
      const { content, sort_order } = req.body;
      db.prepare(`
        INSERT INTO announcements (content, sort_order, is_active)
        VALUES (?, ?, 1)
      `).run(content, sort_order || 0);
      
      logAction(req, '添加公告', '', content.substring(0, 50));
      res.redirect('/admin/pages');
    } catch (e) {
      res.redirect('/admin/pages?error=' + encodeURIComponent(e.message));
    }
  });

  // 删除公告
  router.post('/pages/announcement/:id/delete', requireAdmin, (req, res) => {
    try {
      db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
      logAction(req, '删除公告', `公告ID: ${req.params.id}`, '');
      res.redirect('/admin/pages');
    } catch (e) {
      res.redirect('/admin/pages?error=' + encodeURIComponent(e.message));
    }
  });

  // ========== 活动与荣誉 ==========
  
  router.get('/events', requireAdmin, (req, res) => {
    try {
      const events = db.prepare('SELECT * FROM events ORDER BY event_date DESC').all();
      const honors = db.prepare('SELECT * FROM honors ORDER BY sort_order ASC, id DESC').all();
      const albums = db.prepare('SELECT * FROM albums ORDER BY created_at DESC').all();
      
      res.render('admin/events', {
        title: '活动与荣誉',
        events,
        honors,
        albums,
        activeNav: 'events'
      });
    } catch (e) {
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  // 添加活动
  router.post('/events/new', requireAdmin, upload.single('image'), (req, res) => {
    try {
      const { title, description, event_date, location, is_past } = req.body;
      let imageUrl = '';
      if (req.file) {
        imageUrl = '/uploads/images/' + req.file.filename;
      }
      
      db.prepare(`
        INSERT INTO events (title, description, event_date, location, image_url, is_past)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(title, description, event_date, location, imageUrl, is_past ? 1 : 0);
      
      logAction(req, '添加活动', '', title);
      res.redirect('/admin/events');
    } catch (e) {
      res.redirect('/admin/events?error=' + encodeURIComponent(e.message));
    }
  });

  // 删除活动
  router.post('/events/:id/delete', requireAdmin, (req, res) => {
    try {
      db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
      logAction(req, '删除活动', `活动ID: ${req.params.id}`, '');
      res.redirect('/admin/events');
    } catch (e) {
      res.redirect('/admin/events?error=' + encodeURIComponent(e.message));
    }
  });

  // 添加荣誉
  router.post('/honors/new', requireAdmin, upload.single('certificate'), (req, res) => {
    try {
      const { title, description, award_date, sort_order } = req.body;
      let imageUrl = '';
      if (req.file) {
        imageUrl = '/uploads/images/' + req.file.filename;
      }
      
      db.prepare(`
        INSERT INTO honors (title, description, award_date, certificate_image, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `).run(title, description, award_date, imageUrl, sort_order || 0);
      
      logAction(req, '添加荣誉', '', title);
      res.redirect('/admin/events');
    } catch (e) {
      res.redirect('/admin/events?error=' + encodeURIComponent(e.message));
    }
  });

  // 删除荣誉
  router.post('/honors/:id/delete', requireAdmin, (req, res) => {
    try {
      db.prepare('DELETE FROM honors WHERE id = ?').run(req.params.id);
      logAction(req, '删除荣誉', `荣誉ID: ${req.params.id}`, '');
      res.redirect('/admin/events');
    } catch (e) {
      res.redirect('/admin/events?error=' + encodeURIComponent(e.message));
    }
  });

  // ========== 社团管理 ==========
  
  router.get('/clubs', requireAdmin, (req, res) => {
    try {
      const clubs = db.prepare('SELECT * FROM clubs ORDER BY sort_order ASC, id ASC').all();
      res.render('admin/clubs', {
        title: '社团管理',
        clubs,
        activeNav: 'clubs'
      });
    } catch (e) {
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  // 新增社团
  router.post('/clubs/new', requireAdmin, upload.single('cover_image'), (req, res) => {
    try {
      const { name, slogan, description, goal, teachers, logo_image, sort_order, is_active } = req.body;
      
      let coverImage = '';
      if (req.file) {
        coverImage = '/uploads/images/' + req.file.filename;
      }
      
      db.prepare(`
        INSERT INTO clubs (name, slogan, description, goal, teachers, logo_image, cover_image, sort_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        name, slogan || '', description || '', goal || '', teachers || '', 
        logo_image || '🎯', coverImage, sort_order || 0, is_active ? 1 : 1
      );
      
      logAction(req, '新增社团', '', name);
      res.redirect('/admin/clubs');
    } catch (e) {
      res.redirect('/admin/clubs?error=' + encodeURIComponent(e.message));
    }
  });

  // 编辑社团页面
  router.get('/clubs/:id/edit', requireAdmin, (req, res) => {
    try {
      const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(req.params.id);
      if (!club) {
        return res.status(404).render('404', { title: '社团不存在' });
      }
      
      const clubs = db.prepare('SELECT * FROM clubs ORDER BY sort_order ASC, id ASC').all();
      
      res.render('admin/clubs', {
        title: '社团管理',
        clubs,
        editClub: club,
        activeNav: 'clubs'
      });
    } catch (e) {
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  // 保存编辑社团
  router.post('/clubs/:id/edit', requireAdmin, upload.single('cover_image'), (req, res) => {
    try {
      const { name, slogan, description, goal, teachers, logo_image, sort_order, is_active } = req.body;
      
      const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(req.params.id);
      
      let coverImage = club.cover_image;
      if (req.file) {
        coverImage = '/uploads/images/' + req.file.filename;
      }
      
      db.prepare(`
        UPDATE clubs SET name=?, slogan=?, description=?, goal=?, teachers=?, 
          logo_image=?, cover_image=?, sort_order=?, is_active=?
        WHERE id=?
      `).run(
        name, slogan || '', description || '', goal || '', teachers || '',
        logo_image || '🎯', coverImage, sort_order || 0, is_active ? 1 : 0,
        req.params.id
      );
      
      logAction(req, '编辑社团', `社团ID: ${req.params.id}`, name);
      res.redirect('/admin/clubs');
    } catch (e) {
      res.redirect('/admin/clubs?error=' + encodeURIComponent(e.message));
    }
  });

  // 删除社团
  router.post('/clubs/:id/delete', requireAdmin, (req, res) => {
    try {
      db.prepare('DELETE FROM clubs WHERE id = ?').run(req.params.id);
      logAction(req, '删除社团', `社团ID: ${req.params.id}`, '');
      res.redirect('/admin/clubs');
    } catch (e) {
      res.redirect('/admin/clubs?error=' + encodeURIComponent(e.message));
    }
  });

  // ========== 视频管理 ==========
  
  router.get('/videos', requireAdmin, (req, res) => {
    try {
      const videos = db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all();
      res.render('admin/videos', {
        title: '视频管理',
        videos,
        activeNav: 'videos'
      });
    } catch (e) {
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  router.post('/videos/new', requireAdmin, upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
  ]), (req, res) => {
    try {
      const { title, description, category } = req.body;
      
      let videoUrl = '';
      if (req.files['video'] && req.files['video'][0]) {
        videoUrl = '/uploads/videos/' + req.files['video'][0].filename;
      }
      
      let thumbnail = '';
      if (req.files['thumbnail'] && req.files['thumbnail'][0]) {
        thumbnail = '/uploads/images/' + req.files['thumbnail'][0].filename;
      }
      
      db.prepare(`
        INSERT INTO videos (title, description, video_url, thumbnail, category)
        VALUES (?, ?, ?, ?, ?)
      `).run(title, description, videoUrl, thumbnail, category);
      
      logAction(req, '添加视频', '', title);
      res.redirect('/admin/videos');
    } catch (e) {
      res.redirect('/admin/videos?error=' + encodeURIComponent(e.message));
    }
  });

  router.post('/videos/:id/delete', requireAdmin, (req, res) => {
    try {
      db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);
      logAction(req, '删除视频', `视频ID: ${req.params.id}`, '');
      res.redirect('/admin/videos');
    } catch (e) {
      res.redirect('/admin/videos?error=' + encodeURIComponent(e.message));
    }
  });

  // ========== 相册管理 ==========
  
  router.post('/albums/new', requireAdmin, upload.single('cover'), (req, res) => {
    try {
      const { title, description } = req.body;
      let cover = '';
      if (req.file) {
        cover = '/uploads/images/' + req.file.filename;
      }
      
      db.prepare(`
        INSERT INTO albums (title, description, cover_image)
        VALUES (?, ?, ?)
      `).run(title, description, cover);
      
      logAction(req, '创建相册', '', title);
      res.redirect('/admin/events');
    } catch (e) {
      res.redirect('/admin/events?error=' + encodeURIComponent(e.message));
    }
  });

  // 相册图片上传
  router.post('/albums/:id/photos', requireAdmin, upload.array('photos', 20), (req, res) => {
    try {
      if (req.files && req.files.length > 0) {
        const insert = db.prepare(
          'INSERT INTO album_photos (album_id, image_url, sort_order) VALUES (?, ?, ?)'
        );
        req.files.forEach((file, index) => {
          insert.run(req.params.id, '/uploads/images/' + file.filename, index);
        });
      }
      
      logAction(req, '上传相册图片', `相册ID: ${req.params.id}`, `${req.files?.length || 0}张`);
      res.redirect('/admin/events');
    } catch (e) {
      res.redirect('/admin/events?error=' + encodeURIComponent(e.message));
    }
  });

  // 删除相册
  router.post('/albums/:id/delete', requireAdmin, (req, res) => {
    try {
      db.prepare('DELETE FROM albums WHERE id = ?').run(req.params.id);
      logAction(req, '删除相册', `相册ID: ${req.params.id}`, '');
      res.redirect('/admin/events');
    } catch (e) {
      res.redirect('/admin/events?error=' + encodeURIComponent(e.message));
    }
  });

  // ========== 用户管理 ==========
  
  router.get('/users', requireAdmin, (req, res) => {
    try {
      const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
      res.render('admin/users', {
        title: '用户管理',
        users,
        activeNav: 'users'
      });
    } catch (e) {
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  // 新增用户
  router.post('/users/new', requireAdmin, (req, res) => {
    try {
      const { username, password, real_name, role, email } = req.body;
      
      const existing = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get(username);
      if (existing.count > 0) {
        return res.redirect('/admin/users?error=' + encodeURIComponent('用户名已存在'));
      }
      
      const hash = bcrypt.hashSync(password, 10);
      db.prepare(`
        INSERT INTO users (username, password, real_name, role, email)
        VALUES (?, ?, ?, ?, ?)
      `).run(username, hash, real_name, role, email || '');
      
      logAction(req, '创建用户', '', `${username} (${role})`);
      res.redirect('/admin/users');
    } catch (e) {
      res.redirect('/admin/users?error=' + encodeURIComponent(e.message));
    }
  });

  // 切换上传权限
  router.post('/users/:id/toggle-upload', requireAdmin, (req, res) => {
    try {
      const user = db.prepare('SELECT upload_enabled FROM users WHERE id = ?').get(req.params.id);
      const newVal = user.upload_enabled ? 0 : 1;
      db.prepare('UPDATE users SET upload_enabled = ? WHERE id = ?').run(newVal, req.params.id);
      logAction(req, newVal ? '开启上传权限' : '关闭上传权限', `用户ID: ${req.params.id}`, '');
      res.redirect('/admin/users');
    } catch (e) {
      res.redirect('/admin/users?error=' + encodeURIComponent(e.message));
    }
  });

  // 修改用户角色
  router.post('/users/:id/role', requireAdmin, (req, res) => {
    try {
      const { role } = req.body;
      if (!['admin', 'teacher', 'parent'].includes(role)) {
        return res.redirect('/admin/users?error=' + encodeURIComponent('无效的角色'));
      }
      // 不能修改自己的角色
      if (parseInt(req.params.id) === req.session.user.id) {
        return res.redirect('/admin/users?error=' + encodeURIComponent('不能修改自己的角色'));
      }
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
      logAction(req, '修改用户角色', `用户ID: ${req.params.id}`, `新角色: ${role}`);
      res.redirect('/admin/users');
    } catch (e) {
      res.redirect('/admin/users?error=' + encodeURIComponent(e.message));
    }
  });

  // 重置密码
  router.post('/users/:id/reset-password', requireAdmin, (req, res) => {
    try {
      const newPassword = req.body.password || '123456';
      const hash = bcrypt.hashSync(newPassword, 10);
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
      logAction(req, '重置密码', `用户ID: ${req.params.id}`, '');
      res.redirect('/admin/users');
    } catch (e) {
      res.redirect('/admin/users?error=' + encodeURIComponent(e.message));
    }
  });

  // 删除用户
  router.post('/users/:id/delete', requireAdmin, (req, res) => {
    try {
      if (parseInt(req.params.id) === req.session.user.id) {
        return res.redirect('/admin/users?error=' + encodeURIComponent('不能删除自己'));
      }
      db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
      logAction(req, '删除用户', `用户ID: ${req.params.id}`, '');
      res.redirect('/admin/users');
    } catch (e) {
      res.redirect('/admin/users?error=' + encodeURIComponent(e.message));
    }
  });

  // ========== 操作日志 ==========
  
  router.get('/logs', requireAdmin, (req, res) => {
    try {
      const logs = db.prepare('SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT 200').all();
      res.render('admin/logs', {
        title: '操作日志',
        logs,
        activeNav: 'logs'
      });
    } catch (e) {
      res.status(500).render('error', { title: '错误', message: e.message });
    }
  });

  return router;
};
