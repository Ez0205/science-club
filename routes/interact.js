const express = require('express');
const router = express.Router();

module.exports = function(db, logAction) {

  // 科学问答页面
  router.get('/quiz', (req, res) => {
    try {
      const questions = db.prepare('SELECT * FROM quiz_questions ORDER BY is_weekly DESC, id DESC').all();
      
      res.render('quiz', {
        title: '科学小问答',
        questions,
        activeNav: '/quiz'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: '加载题目失败' });
    }
  });

  // 提交答题
  router.post('/quiz/submit', (req, res) => {
    try {
      const answers = req.body;
      const questions = db.prepare('SELECT * FROM quiz_questions ORDER BY id').all();
      
      let score = 0;
      const results = [];
      
      for (const q of questions) {
        const userAnswer = answers['q_' + q.id] || '';
        const isCorrect = userAnswer === q.correct_answer;
        if (isCorrect) score++;
        
        let options = [];
        if (q.options) {
          try {
            options = JSON.parse(q.options);
          } catch (e) {
            options = [];
          }
        }
        
        results.push({
          id: q.id,
          question: q.question,
          type: q.type,
          options,
          userAnswer,
          correctAnswer: q.correct_answer,
          explanation: q.explanation,
          isCorrect
        });
      }
      
      res.render('quiz-result', {
        title: '答题结果',
        score,
        total: questions.length,
        results,
        activeNav: '/quiz'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: '提交失败' });
    }
  });

  // 留言板
  router.get('/messages', (req, res) => {
    try {
      const messages = db.prepare(
        "SELECT * FROM messages WHERE status = 'approved' ORDER BY created_at DESC"
      ).all();
      
      res.render('messages', {
        title: '留言板',
        messages,
        success: req.query.success || false,
        activeNav: '/messages'
      });
    } catch (e) {
      console.error(e);
      res.status(500).render('error', { title: '错误', message: '加载留言失败' });
    }
  });

  // 提交留言
  router.post('/messages', (req, res) => {
    try {
      const { name, content } = req.body;
      
      if (!name || !content) {
        return res.redirect('/messages?success=0');
      }
      
      // 内容过滤
      const filteredContent = content
        .replace(/fuck|shit|傻逼|草泥马/gi, '***');
      
      db.prepare(`
        INSERT INTO messages (name, content, status)
        VALUES (?, ?, 'approved')
      `).run(name.substring(0, 50), filteredContent.substring(0, 500));
      
      logAction(req, '提交留言', '留言板', content.substring(0, 100));
      
      res.redirect('/messages?success=1');
    } catch (e) {
      console.error(e);
      res.redirect('/messages?success=0');
    }
  });

  // 投票提交
  router.post('/vote/:id', (req, res) => {
    try {
      const voteId = req.params.id;
      const candidateId = req.body.candidate_id;
      const userId = req.session.user ? req.session.user.id : null;
      const ip = req.ip;
      
      // 检查投票是否有效
      const vote = db.prepare('SELECT * FROM votes WHERE id = ?').get(voteId);
      if (!vote) {
        return res.json({ success: false, message: '投票不存在' });
      }
      
      const now = new Date();
      const startDate = new Date(vote.start_date);
      const endDate = new Date(vote.end_date);
      
      if (!vote.is_active || now < startDate || now > endDate) {
        return res.json({ success: false, message: '投票已结束或未开始' });
      }
      
      // 检查是否已投票
      let existing;
      if (userId) {
        existing = db.prepare('SELECT * FROM vote_records WHERE vote_id = ? AND user_id = ?').get(voteId, userId);
      } else {
        existing = db.prepare('SELECT * FROM vote_records WHERE vote_id = ? AND ip_address = ?').get(voteId, ip);
      }
      
      if (existing) {
        return res.json({ success: false, message: '您已经投过票了' });
      }
      
      // 记录投票
      db.prepare(`
        INSERT INTO vote_records (vote_id, candidate_id, user_id, ip_address)
        VALUES (?, ?, ?, ?)
      `).run(voteId, candidateId, userId, ip);
      
      // 更新票数
      db.prepare('UPDATE vote_candidates SET vote_count = vote_count + 1 WHERE id = ?').run(candidateId);
      
      // 获取最新票数
      const candidates = db.prepare(`
        SELECT vc.*, w.title 
        FROM vote_candidates vc 
        JOIN works w ON vc.work_id = w.id 
        WHERE vc.vote_id = ? 
        ORDER BY vc.vote_count DESC
      `).all(voteId);
      
      logAction(req, '投票', `投票ID: ${voteId}`, `候选ID: ${candidateId}`);
      
      res.json({ success: true, message: '投票成功！', candidates });
    } catch (e) {
      console.error(e);
      res.json({ success: false, message: e.message });
    }
  });

  return router;
};
