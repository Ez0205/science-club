// 认证中间件

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/admin-login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('error', { 
      title: '权限不足', 
      message: '您没有访问此页面的权限，需要管理员账号。' 
    });
  }
  next();
}

function requireTeacher(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  if (req.session.user.role !== 'admin' && req.session.user.role !== 'teacher') {
    return res.status(403).render('error', { 
      title: '权限不足', 
      message: '您没有上传作品的权限，需要老师账号。' 
    });
  }
  next();
}

function canUpload(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  if (req.session.user.role === 'parent') {
    return res.status(403).render('error', { 
      title: '权限不足', 
      message: '家长账号没有上传作品的权限，请联系老师。' 
    });
  }
  if (req.session.user.upload_enabled === 0) {
    return res.status(403).render('error', { 
      title: '权限已关闭', 
      message: '您的上传权限已被管理员关闭，请联系管理员。' 
    });
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireTeacher,
  canUpload
};
