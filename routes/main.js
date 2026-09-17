const express = require('express');
const router = express.Router();

module.exports = function(db, logAction) {

  // 首页
  router.get('/', (req, res) => {
    try {
      // 轮播图
      const banners = db.prepare(
        'SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order ASC, id DESC'
      ).all();
      
      // 精选作品
      const featuredWorks = db.prepare(`
        SELECT w.*, 
          (SELECT COUNT(*) FROM comments c WHERE c.work_id = w.id AND c.status = 'approved') as comment_count
        FROM works w 
        WHERE w.status = 'published' AND w.is_featured = 1 
        ORDER BY w.created_at DESC 
        LIMIT 6
      `).all();
      
      // 最新作品
      const latestWorks = db.prepare(`
        SELECT w.*,
          (SELECT COUNT(*) FROM comments c WHERE c.work_id = w.id AND c.status = 'approved') as comment_count
        FROM works w 
        WHERE w.status = 'published' 
        ORDER BY w.created_at DESC 
        LIMIT 8
      `).all();
      
      // 统计数据
      const stats = {
        totalWorks: db.prepare("SELECT COUNT(*) as count FROM works WHERE status = 'published'").get().count,
        totalStudents: db.prepare("SELECT COUNT(DISTINCT author) as count FROM works WHERE status = 'published'").get().count,
        totalHonors: db.prepare('SELECT COUNT(*) as count FROM honors').get().count,
        totalViews: db.prepare('SELECT COALESCE(SUM(views), 0) as total FROM works').get().total,
      };
      
      // 活动
      const events = db.prepare('SELECT * FROM events ORDER BY event_date DESC LIMIT 4').all();
      
      // 活跃投票
      const activeVote = db.prepare(`
        SELECT v.* FROM votes v 
        WHERE v.is_active = 1 AND v.start_date <= date('now') AND v.end_date >= date('now')
        ORDER BY v.created_at DESC LIMIT 1
      `).get();
      
      let voteCandidates = [];
      if (activeVote) {
        voteCandidates = db.prepare(`
          SELECT vc.*, w.title, w.cover_image, w.author 
          FROM vote_candidates vc 
          JOIN works w ON vc.work_id = w.id 
          WHERE vc.vote_id = ? 
          ORDER BY vc.vote_count DESC
        `).all(activeVote.id);
      }
      
      // 本周问答
      const weeklyQuiz = db.prepare(
        "SELECT * FROM quiz_questions WHERE is_weekly = 1 ORDER BY id DESC LIMIT 1"
      ).get();
      
      res.render('index', {
        title: '首页',
        banners,
        featuredWorks,
        latestWorks,
        stats,
        events,
        activeVote,
        voteCandidates,
        weeklyQuiz,
        activeNav: '/'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: '加载首页失败' });
    }
  });

  // 社团介绍（多个社团列表）
  router.get('/about', (req, res) => {
    try {
      const clubs = db.prepare(
        "SELECT * FROM clubs WHERE is_active = 1 ORDER BY sort_order ASC, id ASC"
      ).all();
      const events = db.prepare('SELECT * FROM events ORDER BY event_date DESC').all();
      const honors = db.prepare('SELECT * FROM honors ORDER BY sort_order ASC, id DESC').all();
      
      res.render('about', {
        title: '社团介绍',
        clubs,
        events,
        honors,
        activeNav: '/about'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: '加载页面失败' });
    }
  });

  // 社团详情页
  router.get('/clubs/:id', (req, res) => {
    try {
      const club = db.prepare('SELECT * FROM clubs WHERE id = ? AND is_active = 1').get(req.params.id);
      if (!club) {
        return res.status(404).render('404', { title: '社团不存在' });
      }
      
      // 该社团相关作品（用分类关联）
      const works = db.prepare(`
        SELECT * FROM works 
        WHERE status = 'published' 
        ORDER BY created_at DESC 
        LIMIT 6
      `).all();
      
      res.render('club-detail', {
        title: club.name,
        club,
        works,
        activeNav: '/about'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: '加载页面失败' });
    }
  });

  // 活动相册列表
  router.get('/albums', (req, res) => {
    try {
      const albums = db.prepare(`
        SELECT a.*, 
          (SELECT COUNT(*) FROM album_photos ap WHERE ap.album_id = a.id) as photo_count
        FROM albums a 
        ORDER BY a.created_at DESC
      `).all();
      
      res.render('albums', {
        title: '活动相册',
        albums,
        activeNav: '/albums'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: '加载相册失败' });
    }
  });

  // 相册详情
  router.get('/albums/:id', (req, res) => {
    try {
      const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
      if (!album) {
        return res.status(404).render('404', { title: '相册不存在' });
      }
      
      const photos = db.prepare(
        'SELECT * FROM album_photos WHERE album_id = ? ORDER BY sort_order ASC, id ASC'
      ).all(req.params.id);
      
      res.render('album-detail', {
        title: album.title,
        album,
        photos,
        activeNav: '/albums'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: '加载相册失败' });
    }
  });

  // 视频合集
  router.get('/videos', (req, res) => {
    try {
      const category = req.query.category || '';
      let sql = 'SELECT * FROM videos';
      let params = [];
      
      if (category) {
        sql += ' WHERE category = ?';
        params.push(category);
      }
      
      sql += ' ORDER BY created_at DESC';
      const videos = db.prepare(sql).all(...params);
      
      const categories = db.prepare(
        "SELECT DISTINCT category FROM videos WHERE category IS NOT NULL AND category != ''"
      ).all().map(v => v.category);
      
      res.render('videos', {
        title: '实验视频',
        videos,
        categories,
        currentCategory: category,
        activeNav: '/videos'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: '加载视频失败' });
    }
  });

  // 投票页面
  router.get('/vote', (req, res) => {
    try {
      const votes = db.prepare('SELECT * FROM votes ORDER BY created_at DESC').all();
      
      const votesWithCandidates = votes.map(vote => {
        const candidates = db.prepare(`
          SELECT vc.*, w.title, w.cover_image, w.author 
          FROM vote_candidates vc 
          JOIN works w ON vc.work_id = w.id 
          WHERE vc.vote_id = ? 
          ORDER BY vc.vote_count DESC
        `).all(vote.id);
        
        const isActive = vote.is_active && 
          new Date(vote.start_date) <= new Date() && 
          new Date(vote.end_date) >= new Date();
        
        return { ...vote, candidates, isActive };
      });
      
      res.render('vote', {
        title: '在线投票',
        votes: votesWithCandidates,
        activeNav: '/vote'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: '加载投票失败' });
    }
  });

  return router;
};
