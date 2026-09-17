const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 确保uploads目录存在
const uploadDirs = [
  path.join(__dirname, 'public/uploads/images'),
  path.join(__dirname, 'public/uploads/videos'),
  path.join(__dirname, 'public/uploads/covers'),
];
for (const dir of uploadDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 数据库连接
const db = new Database(path.join(__dirname, 'database', 'science.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 中间件
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'science-club-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24小时
}));

// 视图引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 全局中间件 - 传递用户信息和网站设置到所有模板
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  
  // 获取网站设置
  try {
    const settings = db.prepare('SELECT key_name, value FROM site_settings').all();
    res.locals.siteSettings = {};
    for (const s of settings) {
      res.locals.siteSettings[s.key_name] = s.value;
    }
  } catch (e) {
    res.locals.siteSettings = {
      site_name: '小小科学家・实验创想',
      site_slogan: '探索科学奥秘，点燃创新梦想'
    };
  }
  
  // 获取公告
  try {
    res.locals.announcements = db.prepare(
      'SELECT * FROM announcements WHERE is_active = 1 ORDER BY sort_order ASC, id DESC'
    ).all();
  } catch (e) {
    res.locals.announcements = [];
  }
  
  // 获取导航菜单（从数据库读取自定义文字）
  const navSettings = res.locals.siteSettings || {};
  res.locals.navItems = [
    { name: navSettings.nav_home || '首页', path: '/' },
    { name: navSettings.nav_works || '实验作品库', path: '/works' },
    { name: navSettings.nav_albums || '活动相册', path: '/albums' },
    { name: navSettings.nav_videos || '实验视频', path: '/videos' },
    { name: navSettings.nav_quiz || '科学问答', path: '/quiz' },
    { name: navSettings.nav_messages || '留言板', path: '/messages' },
    { name: navSettings.nav_about || '社团介绍', path: '/about' },
  ];
  
  // 默认激活导航
  res.locals.activeNav = '';
  
  next();
});

// 记录操作日志
function logAction(req, action, target, details) {
  try {
    db.prepare(`
      INSERT INTO operation_logs (user_id, username, action, target, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.session.user ? req.session.user.id : null,
      req.session.user ? req.session.user.username : 'guest',
      action, target, details,
      req.ip || req.connection.remoteAddress
    );
  } catch (e) {
    console.error('日志记录失败:', e);
  }
}

app.locals.logAction = logAction;

// 路由
const mainRoutes = require('./routes/main')(db, logAction);
const workRoutes = require('./routes/works')(db, logAction);
const authRoutes = require('./routes/auth')(db, logAction);
const adminRoutes = require('./routes/admin')(db, logAction);
const interactRoutes = require('./routes/interact')(db, logAction);

app.use('/', mainRoutes);
app.use('/', workRoutes);
app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/', interactRoutes);

// 404处理
app.use((req, res) => {
  res.status(404).render('404', { title: '页面不存在' });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { title: '服务器错误', message: err.message });
});

app.listen(PORT, () => {
  console.log(`科学实验社团网站已启动: http://localhost:${PORT}`);
  console.log('管理员账号: admin / admin123');
  console.log('老师账号: teacher / teacher123');
  console.log('家长账号: parent / parent123');
});

module.exports = app;
