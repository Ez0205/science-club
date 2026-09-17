const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

module.exports = function(db, logAction) {

  // 前台登录页面
  router.get('/login', (req, res) => {
    if (req.session.user) {
      return res.redirect('/');
    }
    res.render('login', {
      title: '登录',
      redirect: req.query.redirect || '/',
      error: null
    });
  });

  // 前台登录提交
  router.post('/login', (req, res) => {
    try {
      const { username, password, redirect } = req.body;
      
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      
      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.render('login', {
          title: '登录',
          redirect: redirect || '/',
          error: '用户名或密码错误'
        });
      }
      
      req.session.user = {
        id: user.id,
        username: user.username,
        real_name: user.real_name,
        role: user.role,
        email: user.email,
        upload_enabled: user.upload_enabled
      };
      
      logAction(req, '登录', '用户登录', user.role);
      
      // 管理员跳转到后台
      if (user.role === 'admin') {
        return req.session.save(() => {
          res.redirect('/admin');
        });
      }
      
      req.session.save(() => {
        res.redirect(redirect || '/');
      });
    } catch (e) {
      console.error(e);
      res.render('login', {
        title: '登录',
        redirect: req.body.redirect || '/',
        error: '登录失败，请重试'
      });
    }
  });

  // 管理员登录页面
  router.get('/admin-login', (req, res) => {
    if (req.session.user && req.session.user.role === 'admin') {
      return res.redirect('/admin');
    }
    res.render('admin-login', {
      title: '管理员登录',
      redirect: req.query.redirect || '/admin',
      error: null
    });
  });

  // 管理员登录提交
  router.post('/admin-login', (req, res) => {
    try {
      const { username, password, redirect } = req.body;
      
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      
      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.render('admin-login', {
          title: '管理员登录',
          redirect: redirect || '/admin',
          error: '用户名或密码错误'
        });
      }
      
      if (user.role !== 'admin') {
        return res.render('admin-login', {
          title: '管理员登录',
          redirect: redirect || '/admin',
          error: '该账号没有管理员权限'
        });
      }
      
      req.session.user = {
        id: user.id,
        username: user.username,
        real_name: user.real_name,
        role: user.role,
        email: user.email,
        upload_enabled: user.upload_enabled
      };
      
      logAction(req, '管理员登录', '后台登录', '');
      
      req.session.save(() => {
        res.redirect(redirect || '/admin');
      });
    } catch (e) {
      console.error(e);
      res.render('admin-login', {
        title: '管理员登录',
        redirect: req.body.redirect || '/admin',
        error: '登录失败，请重试'
      });
    }
  });

  // 注册页面
  router.get('/register', (req, res) => {
    if (req.session.user) {
      return res.redirect('/');
    }
    res.render('register', {
      title: '注册',
      error: null
    });
  });

  // 注册提交 - 默认家长角色
  router.post('/register', (req, res) => {
    try {
      const { username, password, real_name, email } = req.body;
      
      if (!username || !password || !real_name) {
        return res.render('register', {
          title: '注册',
          error: '请填写完整信息'
        });
      }
      
      if (password.length < 6) {
        return res.render('register', {
          title: '注册',
          error: '密码至少6位'
        });
      }
      
      const existing = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get(username);
      if (existing.count > 0) {
        return res.render('register', {
          title: '注册',
          error: '用户名已存在'
        });
      }
      
      const hash = bcrypt.hashSync(password, 10);
      db.prepare(`
        INSERT INTO users (username, password, real_name, role, email)
        VALUES (?, ?, ?, 'parent', ?)
      `).run(username, hash, real_name, email || '');
      
      logAction(req, '注册', '新用户注册', username);
      
      res.redirect('/login?registered=1');
    } catch (e) {
      console.error(e);
      res.render('register', {
        title: '注册',
        error: '注册失败：' + e.message
      });
    }
  });

  // 退出登录
  router.get('/logout', (req, res) => {
    logAction(req, '退出登录', '用户登出', '');
    req.session.destroy();
    res.redirect('/');
  });

  return router;
};
