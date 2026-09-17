const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'science.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 用户表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    real_name TEXT,
    role TEXT NOT NULL DEFAULT 'parent',
    email TEXT,
    class TEXT,
    upload_enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 作品表
db.exec(`
  CREATE TABLE IF NOT EXISTS works (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    author TEXT NOT NULL,
    class TEXT,
    summary TEXT,
    principle TEXT,
    reflection TEXT,
    cover_image TEXT,
    video_url TEXT,
    images TEXT,
    status TEXT DEFAULT 'pending',
    reject_reason TEXT,
    uploader_id INTEGER,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    is_featured INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploader_id) REFERENCES users(id)
  )
`);

// 评论表
db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL,
    author_name TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'approved',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
  )
`);

// 点赞记录表
db.exec(`
  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL,
    ip_address TEXT,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
  )
`);

// 投票表
db.exec(`
  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 投票候选作品
db.exec(`
  CREATE TABLE IF NOT EXISTS vote_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vote_id INTEGER NOT NULL,
    work_id INTEGER NOT NULL,
    vote_count INTEGER DEFAULT 0,
    FOREIGN KEY (vote_id) REFERENCES votes(id) ON DELETE CASCADE,
    FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
  )
`);

// 投票记录
db.exec(`
  CREATE TABLE IF NOT EXISTS vote_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vote_id INTEGER NOT NULL,
    candidate_id INTEGER NOT NULL,
    ip_address TEXT,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vote_id) REFERENCES votes(id) ON DELETE CASCADE
  )
`);

// 科学问答题库
db.exec(`
  CREATE TABLE IF NOT EXISTS quiz_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'choice',
    options TEXT,
    correct_answer TEXT NOT NULL,
    explanation TEXT,
    is_weekly INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 留言板
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    reply TEXT,
    status TEXT DEFAULT 'approved',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 活动相册
db.exec(`
  CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    cover_image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 相册图片
db.exec(`
  CREATE TABLE IF NOT EXISTS album_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    caption TEXT,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
  )
`);

// 视频合集
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    video_url TEXT NOT NULL,
    thumbnail TEXT,
    category TEXT,
    views INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 网站设置
db.exec(`
  CREATE TABLE IF NOT EXISTS site_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_name TEXT UNIQUE NOT NULL,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 活动日程
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    event_date DATE,
    location TEXT,
    image_url TEXT,
    is_past INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 荣誉墙
db.exec(`
  CREATE TABLE IF NOT EXISTS honors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    award_date DATE,
    certificate_image TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 操作日志
db.exec(`
  CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    target TEXT,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 公告
db.exec(`
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 轮播图
db.exec(`
  CREATE TABLE IF NOT EXISTS banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    image_url TEXT NOT NULL,
    link_url TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 插入默认管理员账号
const adminCheck = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?');
const adminResult = adminCheck.get('admin');
if (adminResult.count === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  const insertAdmin = db.prepare(`
    INSERT INTO users (username, password, real_name, role, email)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertAdmin.run('admin', hash, '超级管理员', 'admin', 'admin@school.edu');
  console.log('默认管理员账号已创建: admin / admin123');
}

// 插入默认老师账号
const teacherCheck = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?');
const teacherResult = teacherCheck.get('teacher');
if (teacherResult.count === 0) {
  const hash = bcrypt.hashSync('teacher123', 10);
  const insertTeacher = db.prepare(`
    INSERT INTO users (username, password, real_name, role, email)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertTeacher.run('teacher', hash, '张老师', 'teacher', 'teacher@school.edu');
  console.log('默认老师账号已创建: teacher / teacher123');
}

// 插入默认家长账号
const parentCheck = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?');
const parentResult = parentCheck.get('parent');
if (parentResult.count === 0) {
  const hash = bcrypt.hashSync('parent123', 10);
  const insertParent = db.prepare(`
    INSERT INTO users (username, password, real_name, role, email)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertParent.run('parent', hash, '家长代表', 'parent', 'parent@school.edu');
  console.log('默认家长账号已创建: parent / parent123');
}

// 插入默认网站设置
const settingsData = [
  ['site_name', '小小科学家・实验创想'],
  ['site_slogan', '探索科学奥秘，点燃创新梦想'],
  ['club_intro', '科学实验社团成立于2020年，致力于培养学生的科学素养和动手实践能力。社团每周开展丰富多彩的实验活动，涵盖物理、化学、生物、工程等多个领域。'],
  ['club_goal', '让每一位学生都能在实验中感受科学的魅力，培养创新思维和团队协作能力。'],
  ['teacher_intro', '指导老师：李教授、王老师、陈老师，均具有丰富的科学教育经验。'],
  ['contact_info', '联系邮箱：science@school.edu | 联系电话：010-12345678'],
  ['copyright', '© 2024 科学实验社团 版权所有'],
];

const insertSetting = db.prepare('INSERT OR IGNORE INTO site_settings (key_name, value) VALUES (?, ?)');
for (const [key, value] of settingsData) {
  insertSetting.run(key, value);
}

// 插入示例作品
const workCount = db.prepare('SELECT COUNT(*) as count FROM works').get();
if (workCount.count === 0) {
  const insertWork = db.prepare(`
    INSERT INTO works (title, category, author, class, summary, principle, reflection, cover_image, status, uploader_id, is_featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, ?)
  `);
  
  const works = [
    ['火山喷发小实验', '化学', '小明', '三年级(1)班', '用小苏打和醋模拟火山喷发的壮观景象', '酸碱中和反应产生二氧化碳气体', '实验非常成功，下次可以尝试不同颜色的熔岩', '/uploads/covers/volcano.jpg', 1],
    ['自制小台灯', '工程', '小红', '四年级(2)班', '利用简单电路原理制作一盏LED小台灯', '串联电路原理，电流通过LED发光', '学会了电路连接，以后想做更复杂的电子作品', '/uploads/covers/lamp.jpg', 1],
    ['植物向光性观察', '生物', '小华', '五年级(1)班', '观察绿豆芽在单侧光照射下的生长方向', '植物生长素分布不均匀导致向光性弯曲', '持续观察了7天，记录了每天的变化', '/uploads/covers/plant.jpg', 0],
    ['水的表面张力', '物理', '小李', '三年级(2)班', '在硬币上滴水，观察水表面能承载多少水滴', '水分子间的氢键形成表面张力', '尝试了不同液体，结果差异很大', '/uploads/covers/water.jpg', 0],
    ['彩虹形成实验', '物理', '小张', '四年级(1)班', '利用三棱镜和手电筒制造彩虹', '光的折射和色散现象', '明白了彩虹的形成原理，太神奇了', '/uploads/covers/rainbow.jpg', 1],
    ['自制净水器', '工程', '小王', '五年级(2)班', '用沙子、活性炭、棉花制作简易净水器', '过滤和吸附原理净化水质', '虽然不能直接饮用，但浑浊的水变清了', '/uploads/covers/filter.jpg', 0],
  ];
  
  for (const work of works) {
    insertWork.run(...work);
  }
  console.log('示例作品已创建');
}

// 插入示例评论
const commentCount = db.prepare('SELECT COUNT(*) as count FROM comments').get();
if (commentCount.count === 0) {
  const insertComment = db.prepare(`
    INSERT INTO comments (work_id, author_name, content, status)
    VALUES (?, ?, ?, 'approved')
  `);
  
  const comments = [
    [1, '科学爱好者', '太厉害了！这个实验我也想做一次'],
    [1, '小明妈妈', '孩子动手能力越来越强了'],
    [2, '工程师爸爸', '电路设计很规范，继续加油！'],
    [3, '生物老师', '观察记录很详细，科学态度值得表扬'],
  ];
  
  for (const comment of comments) {
    insertComment.run(...comment);
  }
  console.log('示例评论已创建');
}

// 插入示例投票
const voteCount = db.prepare('SELECT COUNT(*) as count FROM votes').get();
if (voteCount.count === 0) {
  const insertVote = db.prepare(`
    INSERT INTO votes (title, description, start_date, end_date, is_active)
    VALUES (?, ?, ?, ?, 1)
  `);
  const voteId = insertVote.run('9月最佳实验作品评选', '选出你心目中最棒的科学实验作品！', '2024-09-01', '2024-09-30').lastInsertRowid;
  
  const insertCandidate = db.prepare(`
    INSERT INTO vote_candidates (vote_id, work_id, vote_count)
    VALUES (?, ?, ?)
  `);
  insertCandidate.run(voteId, 1, 28);
  insertCandidate.run(voteId, 2, 35);
  insertCandidate.run(voteId, 3, 22);
  insertCandidate.run(voteId, 5, 41);
  console.log('示例投票已创建');
}

// 插入示例问答题目
const quizCount = db.prepare('SELECT COUNT(*) as count FROM quiz_questions').get();
if (quizCount.count === 0) {
  const insertQuiz = db.prepare(`
    INSERT INTO quiz_questions (question, type, options, correct_answer, explanation, is_weekly)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const quizzes = [
    ['水的化学式是什么？', 'choice', JSON.stringify(['H2O', 'CO2', 'O2', 'NaCl']), 'H2O', '水由两个氢原子和一个氧原子组成，化学式为H2O。', 1],
    ['植物进行光合作用需要阳光。', 'truefalse', '', 'true', '光合作用是植物利用阳光将二氧化碳和水转化为有机物的过程。', 0],
    ['声音在真空中能传播吗？', 'choice', JSON.stringify(['能', '不能', '不确定', '只能在月球上传播']), '不能', '声音需要介质才能传播，真空中没有介质，所以声音不能传播。', 0],
    ['彩虹有几种颜色？', 'choice', JSON.stringify(['5种', '6种', '7种', '8种']), '7种', '彩虹由红、橙、黄、绿、蓝、靛、紫七种颜色组成。', 0],
  ];
  
  for (const quiz of quizzes) {
    insertQuiz.run(...quiz);
  }
  console.log('示例问答题目已创建');
}

// 插入示例留言
const msgCount = db.prepare('SELECT COUNT(*) as count FROM messages').get();
if (msgCount.count === 0) {
  const insertMsg = db.prepare(`
    INSERT INTO messages (name, content, reply, status)
    VALUES (?, ?, ?, 'approved')
  `);
  
  const messages = [
    ['好奇宝宝', '为什么天空是蓝色的呢？', '这是因为太阳光中的蓝光在大气中发生散射的缘故哦！'],
    ['小小发明家', '我想做一个机器人，需要学习什么知识？', '可以从基础电路和编程开始学起，社团有相关课程！'],
  ];
  
  for (const msg of messages) {
    insertMsg.run(...msg);
  }
  console.log('示例留言已创建');
}

// 插入示例相册
const albumCount = db.prepare('SELECT COUNT(*) as count FROM albums').get();
if (albumCount.count === 0) {
  const insertAlbum = db.prepare(`
    INSERT INTO albums (title, description, cover_image)
    VALUES (?, ?, ?)
  `);
  
  const albums = [
    ['科技馆研学之旅', '参观市科技馆，体验各种科学互动展品', '/uploads/covers/album1.jpg'],
    ['春季科学实验课', '新学期第一堂科学实验课精彩瞬间', '/uploads/covers/album2.jpg'],
    ['科技创新大赛', '参加市青少年科技创新大赛现场', '/uploads/covers/album3.jpg'],
  ];
  
  for (const album of albums) {
    insertAlbum.run(...album);
  }
  console.log('示例相册已创建');
}

// 插入示例视频
const videoCount = db.prepare('SELECT COUNT(*) as count FROM videos').get();
if (videoCount.count === 0) {
  const insertVideo = db.prepare(`
    INSERT INTO videos (title, description, video_url, thumbnail, category, views)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const videos = [
    ['火山喷发实验全过程', '带你一步步完成火山喷发小实验', 'https://www.w3schools.com/html/mov_bbb.mp4', '/uploads/covers/video1.jpg', '化学', 156],
    ['如何制作简易电动机', '用电池、铜线和磁铁制作简单电动机', 'https://www.w3schools.com/html/movie.mp4', '/uploads/covers/video2.jpg', '物理', 234],
  ];
  
  for (const video of videos) {
    insertVideo.run(...video);
  }
  console.log('示例视频已创建');
}

// 插入示例公告
const annCount = db.prepare('SELECT COUNT(*) as count FROM announcements').get();
if (annCount.count === 0) {
  const insertAnn = db.prepare(`
    INSERT INTO announcements (content, is_active, sort_order)
    VALUES (?, 1, ?)
  `);
  
  const anns = [
    ['【通知】9月20日将开展秋季科学实验展示活动，欢迎同学们踊跃参加！', 1],
    ['【喜报】我校科学社团在市科技创新大赛中荣获一等奖！', 2],
    ['【招募】新学期科学社团开始招新啦，对科学感兴趣的同学快来报名！', 3],
  ];
  
  for (const ann of anns) {
    insertAnn.run(...ann);
  }
  console.log('示例公告已创建');
}

// 插入示例轮播图
const bannerCount = db.prepare('SELECT COUNT(*) as count FROM banners').get();
if (bannerCount.count === 0) {
  const insertBanner = db.prepare(`
    INSERT INTO banners (title, image_url, link_url, sort_order, is_active)
    VALUES (?, ?, ?, ?, 1)
  `);
  
  const banners = [
    ['小小科学家・实验创想', '/uploads/covers/banner1.jpg', '/works', 1],
    ['探索科学奥秘', '/uploads/covers/banner2.jpg', '/about', 2],
    ['创新从这里开始', '/uploads/covers/banner3.jpg', '/submit', 3],
  ];
  
  for (const banner of banners) {
    insertBanner.run(...banner);
  }
  console.log('示例轮播图已创建');
}

// 插入示例活动日程
const eventCount = db.prepare('SELECT COUNT(*) as count FROM events').get();
if (eventCount.count === 0) {
  const insertEvent = db.prepare(`
    INSERT INTO events (title, description, event_date, location, image_url, is_past)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const events = [
    ['秋季科学实验展示', '学生展示自己的科学实验成果', '2024-09-20', '学校礼堂', '/uploads/covers/event1.jpg', 0],
    ['科技馆研学', '参观市科技馆', '2024-10-15', '市科技馆', '/uploads/covers/event2.jpg', 0],
    ['暑期科学夏令营', '为期一周的科学探索之旅', '2024-07-10', '青少年活动中心', '/uploads/covers/event3.jpg', 1],
  ];
  
  for (const event of events) {
    insertEvent.run(...event);
  }
  console.log('示例活动已创建');
}

// 插入示例荣誉
const honorCount = db.prepare('SELECT COUNT(*) as count FROM honors').get();
if (honorCount.count === 0) {
  const insertHonor = db.prepare(`
    INSERT INTO honors (title, description, award_date, certificate_image, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  const honors = [
    ['市科技创新大赛一等奖', '2024年市青少年科技创新大赛团体一等奖', '2024-06-15', '/uploads/covers/honor1.jpg', 1],
    ['省科学实验优秀组织奖', '省中小学生科学实验大赛优秀组织奖', '2024-05-20', '/uploads/covers/honor2.jpg', 2],
    ['全国机器人竞赛三等奖', '全国青少年机器人竞赛三等奖', '2023-12-10', '/uploads/covers/honor3.jpg', 3],
  ];
  
  for (const honor of honors) {
    insertHonor.run(...honor);
  }
  console.log('示例荣誉已创建');
}

console.log('数据库初始化完成！');
db.close();
