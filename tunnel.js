const lt = require('localtunnel');

(async () => {
  try {
    const tunnel = await lt({ port: 3000, subdomain: 'science-club-' + Date.now().toString(36) });
    console.log('=================================');
    console.log('公网访问地址: ' + tunnel.url);
    console.log('=================================');
    console.log('隧道已建立，按 Ctrl+C 关闭');
    
    tunnel.on('close', () => {
      console.log('隧道已关闭');
    });
    
    // 保持运行
    setInterval(() => {}, 1000);
  } catch(e) {
    console.error('隧道创建失败: ' + e.message);
    process.exit(1);
  }
})();
