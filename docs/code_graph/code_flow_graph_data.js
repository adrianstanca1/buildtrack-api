var DIAGRAMS = {};

DIAGRAMS.overview = {
  title: 'BuildTrack API — 架构总览',
  sub: 'Node.js + Express + PostgreSQL + Redis + MinIO',
  legend: [
    { color: '#f9e2af', label: '入口 / 启动' },
    { color: '#89b4fa', label: '路由模块' },
    { color: '#a6e3a1', label: '中间件' },
    { color: '#fab387', label: '配置 / 工具' },
    { color: '#cba6f7', label: '外部依赖' },
  ],
  groups: [
    { id: 'entry',    label: '🚀 入口层', x: 40,  y: 40,  w: 200, h: 80 },
    { id: 'routes',   label: '🔀 路由层', x: 280, y: 40,  w: 640, h: 420 },
    { id: 'middleware',label: '🛡️ 中间件层', x: 40, y: 160, w: 200, h: 300 },
    { id: 'config',   label: '⚙️ 配置层', x: 40, y: 500, w: 200, h: 200 },
    { id: 'utils',    label: '🛠️ 工具层', x: 960, y: 40, w: 200, h: 360 },
    { id: 'external', label: '☁️ 外部依赖', x: 960, y: 440, w: 200, h: 260 },
  ],
  nodes: [
    // ── Entry ──
    { id: 'server',     type: 'entry',   label: 'server.ts',       x: 60,  y: 60,  group: 'entry', external: false,
      attrs: [
        { id: 'server.startServer', name: 'startServer()', val: 'async', sig: '启动 HTTP + Socket.IO 服务器', callChain: [
          { id: 'server.startServer', name: 'startServer()', module: 'server', desc: '初始化数据库连接并启动服务器' },
          { id: 'config.pool.connect', name: 'pool.connect()', module: 'config/database', desc: '获取 PostgreSQL 连接' },
          { id: 'config.initDatabase', name: 'initDatabase()', module: 'config/database', desc: '创建表和索引' },
          { id: 'server.httpServer.listen', name: 'httpServer.listen()', module: 'server', desc: '监听端口 3001' },
        ]},
        { id: 'server.io', name: 'io.on(connection)', val: 'Socket.IO', sig: '处理 Socket.IO 连接事件', desc: 'join-project / leave-project / disconnect' },
      ]
    },

    // ── Routes ──
    { id: 'auth',       type: 'module',  label: 'auth.ts',         x: 300, y: 60,  group: 'routes', external: false,
      attrs: [
        { id: 'auth.register', name: 'POST /register', val: 'Public', sig: '用户注册（事务包裹）', desc: '验证密码强度 → 检查邮箱 → 创建用户 → 生成令牌 → 设置 Cookie', callChain: [
          { id: 'auth.register', name: 'POST /register', module: 'auth', desc: '用户注册入口' },
          { id: 'utils.validatePassword', name: 'validatePassword()', module: 'utils/password', desc: '验证密码强度' },
          { id: 'utils.hashPassword', name: 'hashPassword()', module: 'utils/password', desc: 'bcrypt 哈希密码' },
          { id: 'utils.generateAccessToken', name: 'generateAccessToken()', module: 'utils/jwt', desc: '生成 JWT 访问令牌' },
          { id: 'utils.generateRefreshToken', name: 'generateRefreshToken()', module: 'utils/jwt', desc: '生成 JWT 刷新令牌' },
          { id: 'utils.hashRefreshToken', name: 'hashRefreshToken()', module: 'utils/jwt', desc: 'SHA-256 哈希刷新令牌' },
          { id: 'utils.auditLog', name: 'auditLog()', module: 'utils/audit', desc: '记录审计日志' },
        ]},
        { id: 'auth.login', name: 'POST /login', val: 'Public', sig: '用户登录（5次/15分钟限流）', desc: '查询用户 → bcrypt 比对 → 生成令牌 → 设置 Cookie → 审计日志' },
        { id: 'auth.refresh', name: 'POST /refresh', val: 'Public', sig: '刷新访问令牌', desc: '验证刷新令牌 → 生成新令牌 → 更新 Cookie' },
        { id: 'auth.logout', name: 'POST /logout', val: 'Cookie', sig: '退出登录', desc: '删除刷新令牌 → 清除 Cookie → 使缓存失效' },
        { id: 'auth.me', name: 'GET /me', val: 'Bearer', sig: '获取当前用户', desc: '从数据库查询用户信息' },
        { id: 'auth.changePassword', name: 'POST /change-password', val: 'Bearer', sig: '修改密码', desc: '验证旧密码 → bcrypt 新密码 → 撤销所有令牌' },
      ]
    },
    { id: 'projects',   type: 'module',  label: 'projects.ts',     x: 300, y: 200, group: 'routes', external: false,
      attrs: [
        { id: 'projects.list', name: 'GET /', val: 'Bearer', sig: '列出项目（分页/筛选）' },
        { id: 'projects.create', name: 'POST /', val: 'Bearer', sig: '创建项目' },
        { id: 'projects.get', name: 'GET /:id', val: 'Bearer', sig: '获取项目详情' },
        { id: 'projects.update', name: 'PUT /:id', val: 'Bearer', sig: '更新项目' },
        { id: 'projects.delete', name: 'DELETE /:id', val: 'Bearer', sig: '删除项目' },
      ]
    },
    { id: 'tasks',      type: 'module',  label: 'tasks.ts',        x: 300, y: 320, group: 'routes', external: false,
      attrs: [
        { id: 'tasks.list', name: 'GET /', val: 'Bearer', sig: '列出任务（多条件筛选）' },
        { id: 'tasks.create', name: 'POST /', val: 'Bearer', sig: '创建任务' },
        { id: 'tasks.update', name: 'PUT /:id', val: 'Bearer', sig: '更新任务状态/分配' },
      ]
    },
    { id: 'workers',    type: 'module',  label: 'workers.ts',      x: 460, y: 60,  group: 'routes', external: false,
      attrs: [
        { id: 'workers.list', name: 'GET /', val: 'Bearer', sig: '列出工人' },
        { id: 'workers.create', name: 'POST /', val: 'Bearer', sig: '添加工人' },
      ]
    },
    { id: 'safety',     type: 'module',  label: 'safety.ts',       x: 460, y: 200, group: 'routes', external: false,
      attrs: [
        { id: 'safety.list', name: 'GET /', val: 'Bearer', sig: '安全事件列表' },
        { id: 'safety.create', name: 'POST /', val: 'Bearer', sig: '上报安全事件' },
      ]
    },
    { id: 'inspections',type: 'module',  label: 'inspections.ts',  x: 620, y: 60,  group: 'routes', external: false,
      attrs: [
        { id: 'inspections.list', name: 'GET /', val: 'Bearer', sig: '检查记录列表' },
        { id: 'inspections.create', name: 'POST /', val: 'Bearer', sig: '创建检查' },
      ]
    },
    { id: 'notifications',type:'module',  label: 'notifications.ts',x: 620, y: 200, group: 'routes', external: false,
      attrs: [
        { id: 'notifications.list', name: 'GET /', val: 'Bearer', sig: '通知列表' },
        { id: 'notifications.markRead', name: 'PATCH /:id/read', val: 'Bearer', sig: '标记已读' },
      ]
    },
    { id: 'dashboard',  type: 'module',  label: 'dashboard.ts',    x: 460, y: 320, group: 'routes', external: false,
      attrs: [
        { id: 'dashboard.stats', name: 'GET /stats', val: 'Bearer', sig: '仪表盘统计' },
        { id: 'dashboard.activity', name: 'GET /activity', val: 'Bearer', sig: '最近活动' },
      ]
    },
    { id: 'admin',      type: 'module',  label: 'admin.ts',        x: 620, y: 320, group: 'routes', external: false,
      attrs: [
        { id: 'admin.stats', name: 'GET /stats', val: 'Admin', sig: '管理统计' },
        { id: 'admin.users', name: 'GET /users', val: 'Admin', sig: '用户管理' },
      ]
    },
    { id: 'uploads',    type: 'module',  label: 'uploads.ts',      x: 780, y: 60,  group: 'routes', external: false,
      attrs: [
        { id: 'uploads.upload', name: 'POST /', val: 'Bearer', sig: '文件上传（Multer → MinIO）', desc: 'multer 接收文件 → MinIO 上传 → 返回 URL' },
      ]
    },

    // ── Middleware ──
    { id: 'mw_auth',    type: 'function',label: 'authenticateToken',x: 60, y: 180, group: 'middleware', external: false,
      attrs: [
        { id: 'mw_auth.verify', name: 'jwt.verify()', val: 'JWT', sig: '验证 JWT 签名' },
        { id: 'mw_auth.cache', name: 'getCachedUser()', val: 'Redis', sig: '尝试从 Redis 缓存获取用户', desc: '缓存命中 → 跳过数据库查询；未命中 → 查询 PostgreSQL 并写入缓存' },
        { id: 'mw_auth.db', name: 'pool.query()', val: 'PostgreSQL', sig: '验证用户存在性', desc: '查询 users 表确认用户未被删除' },
        { id: 'mw_auth.setCache', name: 'setCachedUser()', val: 'Redis', sig: '缓存用户数据（5分钟）' },
      ]
    },
    { id: 'mw_validate',type: 'function',label: 'validate()',      x: 60, y: 280, group: 'middleware', external: false,
      attrs: [
        { id: 'mw_validate.zod', name: 'zod.parse()', val: 'Zod', sig: '请求体校验', desc: '验证请求体是否符合 Zod Schema' },
      ]
    },
    { id: 'mw_rate',    type: 'function',label: 'rateLimit',       x: 60, y: 360, group: 'middleware', external: false,
      attrs: [
        { id: 'mw_rate.global', name: '全局限流', val: '100/15min', sig: '所有 /api/* 请求' },
        { id: 'mw_rate.auth', name: '认证限流', val: '5/15min', sig: '仅 /api/auth/* 失败请求' },
      ]
    },
    { id: 'mw_error',   type: 'function',label: 'errorHandler',    x: 60, y: 420, group: 'middleware', external: false,
      attrs: [
        { id: 'mw_error.handle', name: '统一错误处理', val: '500/404', sig: '格式化错误响应' },
      ]
    },

    // ── Config ──
    { id: 'config_db',  type: 'module',  label: 'database.ts',     x: 60, y: 520, group: 'config', external: false,
      attrs: [
        { id: 'config_db.pool', name: 'Pool', val: 'pg.Pool', sig: 'PostgreSQL 连接池（max: 20）' },
        { id: 'config_db.query', name: 'query()', val: 'helper', sig: '自动释放客户端的查询助手' },
        { id: 'config_db.init', name: 'initDatabase()', val: 'init', sig: '自动创建表和索引' },
      ]
    },
    { id: 'config_redis',type: 'module',  label: 'redis.ts',        x: 60, y: 620, group: 'config', external: false,
      attrs: [
        { id: 'config_redis.client', name: 'redis', val: 'ioredis', sig: 'Redis 客户端' },
        { id: 'config_redis.getCachedUser', name: 'getCachedUser()', val: 'helper', sig: '获取缓存用户' },
        { id: 'config_redis.setCachedUser', name: 'setCachedUser()', val: 'helper', sig: '设置缓存（默认 5 分钟）' },
        { id: 'config_redis.invalidateUserCache', name: 'invalidateUserCache()', val: 'helper', sig: '使缓存失效' },
      ]
    },
    { id: 'config_minio',type: 'module', label: 'minio.ts',        x: 60, y: 700, group: 'config', external: false,
      attrs: [
        { id: 'config_minio.client', name: 'S3Client', val: 'AWS SDK', sig: 'MinIO 客户端' },
        { id: 'config_minio.upload', name: 'uploadFile()', val: 'helper', sig: '上传文件到 MinIO' },
        { id: 'config_minio.signedUrl', name: 'getSignedDownloadUrl()', val: 'helper', sig: '生成预签名下载 URL' },
      ]
    },
    { id: 'config_swagger',type:'module',label: 'swagger.ts',      x: 60, y: 780, group: 'config', external: false,
      attrs: [
        { id: 'config_swagger.spec', name: 'swaggerSpec', val: 'JSDoc', sig: 'OpenAPI 2.0 文档' },
      ]
    },

    // ── Utils ──
    { id: 'utils_jwt',  type: 'function',label: 'jwt.ts',          x: 980, y: 60,  group: 'utils', external: false,
      attrs: [
        { id: 'utils_jwt.generateAccess', name: 'generateAccessToken()', val: 'JWT', sig: '生成访问令牌（15分钟）' },
        { id: 'utils_jwt.generateRefresh', name: 'generateRefreshToken()', val: 'JWT', sig: '生成刷新令牌（7天）' },
        { id: 'utils_jwt.verifyAccess', name: 'verifyAccessToken()', val: 'JWT', sig: '验证访问令牌' },
        { id: 'utils_jwt.verifyRefresh', name: 'verifyRefreshToken()', val: 'JWT', sig: '验证刷新令牌' },
        { id: 'utils_jwt.hashRefresh', name: 'hashRefreshToken()', val: 'SHA-256', sig: '哈希刷新令牌' },
      ]
    },
    { id: 'utils_password',type:'function',label:'password.ts',     x: 980, y: 200, group: 'utils', external: false,
      attrs: [
        { id: 'utils_password.hash', name: 'hashPassword()', val: 'bcrypt', sig: '哈希密码（cost: 12）' },
        { id: 'utils_password.compare', name: 'comparePassword()', val: 'bcrypt', sig: '比对密码' },
        { id: 'utils_password.validate', name: 'validatePassword()', val: 'regex', sig: '验证密码强度' },
      ]
    },
    { id: 'utils_response',type:'function',label:'response.ts',     x: 980, y: 320, group: 'utils', external: false,
      attrs: [
        { id: 'utils_response.success', name: 'successResponse()', val: 'helper', sig: '成功响应包装 {success, data}' },
        { id: 'utils_response.error', name: 'errorResponse()', val: 'helper', sig: '错误响应包装 {success, error}' },
        { id: 'utils_response.paginated', name: 'paginatedResponse()', val: 'helper', sig: '分页响应包装' },
      ]
    },
    { id: 'utils_audit',type: 'function',label: 'audit.ts',        x: 980, y: 440, group: 'utils', external: false,
      attrs: [
        { id: 'utils_audit.log', name: 'auditLog()', val: 'async', sig: '写入 audit_logs 表', desc: '记录 REGISTER/LOGIN/REFRESH/LOGOUT/CHANGE_PASSWORD 事件' },
      ]
    },
    { id: 'utils_logger',type:'function',label: 'logger.ts',       x: 980, y: 520, group: 'utils', external: false,
      attrs: [
        { id: 'utils_logger.winston', name: 'Winston', val: 'logger', sig: '结构化日志（JSON）', desc: '输出到 logs/error.log + logs/combined.log + 控制台' },
      ]
    },

    // ── External ──
    { id: 'ext_postgres',type: 'module', label: 'PostgreSQL',      x: 980, y: 600, group: 'external', external: true,
      attrs: [
        { id: 'ext_postgres.db', name: 'buildtrack_api', val: 'DB', sig: '主数据库（端口 55432）' },
        { id: 'ext_postgres.tables', name: '10 张表', val: 'schema', sig: 'users, projects, tasks, workers, incidents, inspections, notifications, activity_logs, project_workers, refresh_tokens' },
      ]
    },
    { id: 'ext_redis',  type: 'module',  label: 'Redis',           x: 980, y: 720, group: 'external', external: true,
      attrs: [
        { id: 'ext_redis.cache', name: '用户缓存', val: 'TTL 300s', sig: '键: user:{userId}' },
      ]
    },
    { id: 'ext_minio',  type: 'module',  label: 'MinIO',           x: 980, y: 820, group: 'external', external: true,
      attrs: [
        { id: 'ext_minio.bucket', name: 'buildtrack-uploads', val: 'S3', sig: '文件存储桶' },
      ]
    },
    { id: 'ext_socket', type: 'module',  label: 'Socket.IO',       x: 980, y: 900, group: 'external', external: true,
      attrs: [
        { id: 'ext_socket.events', name: '实时事件', val: 'ws', sig: 'join-project / leave-project / disconnect' },
      ]
    },
  ],
  connections: [
    // Server → Routes
    { from: 'server.startServer', to: 'auth.register',     color: '#a6e3a1', style: 'solid' },
    { from: 'server.startServer', to: 'config_db.init',     color: '#a6e3a1', style: 'solid' },

    // Auth flow
    { from: 'auth.register', to: 'utils_password.hash',   color: '#89b4fa', style: 'solid' },
    { from: 'auth.register', to: 'utils_jwt.generateAccess',color: '#89b4fa', style: 'solid' },
    { from: 'auth.register', to: 'utils_jwt.generateRefresh',color:'#89b4fa', style: 'solid' },
    { from: 'auth.register', to: 'utils_jwt.hashRefresh', color: '#89b4fa', style: 'solid' },
    { from: 'auth.register', to: 'utils_audit.log',         color: '#89b4fa', style: 'solid' },
    { from: 'auth.register', to: 'config_db.pool',         color: '#89b4fa', style: 'solid' },

    { from: 'auth.login',    to: 'utils_password.compare',color: '#89b4fa', style: 'solid' },
    { from: 'auth.login',    to: 'utils_jwt.generateAccess',color:'#89b4fa', style: 'solid' },
    { from: 'auth.login',    to: 'utils_jwt.generateRefresh',color:'#89b4fa', style: 'solid' },
    { from: 'auth.login',    to: 'utils_jwt.hashRefresh', color: '#89b4fa', style: 'solid' },
    { from: 'auth.login',    to: 'utils_audit.log',       color: '#89b4fa', style: 'solid' },
    { from: 'auth.login',    to: 'config_db.pool',         color: '#89b4fa', style: 'solid' },

    { from: 'auth.refresh',  to: 'utils_jwt.verifyRefresh', color: '#89b4fa', style: 'solid' },
    { from: 'auth.refresh',  to: 'utils_jwt.generateAccess',color:'#89b4fa', style: 'solid' },
    { from: 'auth.refresh',  to: 'utils_jwt.hashRefresh', color: '#89b4fa', style: 'solid' },
    { from: 'auth.refresh',  to: 'utils_audit.log',       color: '#89b4fa', style: 'solid' },
    { from: 'auth.refresh',  to: 'config_db.pool',         color: '#89b4fa', style: 'solid' },

    { from: 'auth.logout',   to: 'utils_jwt.hashRefresh', color: '#89b4fa', style: 'solid' },
    { from: 'auth.logout',   to: 'config_redis.invalidateUserCache', color: '#89b4fa', style: 'solid' },
    { from: 'auth.logout',   to: 'utils_audit.log',       color: '#89b4fa', style: 'solid' },
    { from: 'auth.logout',   to: 'config_db.pool',         color: '#89b4fa', style: 'solid' },

    { from: 'auth.changePassword', to: 'utils_password.compare',color:'#89b4fa', style: 'solid' },
    { from: 'auth.changePassword', to: 'utils_password.hash',   color:'#89b4fa', style: 'solid' },
    { from: 'auth.changePassword', to: 'config_redis.invalidateUserCache',color:'#89b4fa', style: 'solid' },
    { from: 'auth.changePassword', to: 'utils_audit.log',       color:'#89b4fa', style: 'solid' },

    // Middleware → Routes
    { from: 'mw_auth.verify', to: 'auth.me',               color: '#cba6f7', style: 'dashed' },
    { from: 'mw_auth.verify', to: 'projects.list',         color: '#cba6f7', style: 'dashed' },
    { from: 'mw_auth.verify', to: 'tasks.list',            color: '#cba6f7', style: 'dashed' },
    { from: 'mw_auth.verify', to: 'dashboard.stats',         color: '#cba6f7', style: 'dashed' },

    // Middleware flow
    { from: 'mw_auth.cache', to: 'ext_redis.cache',       color: '#fab387', style: 'solid' },
    { from: 'mw_auth.db',    to: 'ext_postgres.db',       color: '#fab387', style: 'solid' },
    { from: 'mw_auth.setCache', to: 'ext_redis.cache',    color: '#fab387', style: 'solid' },

    // Uploads → MinIO
    { from: 'uploads.upload', to: 'config_minio.upload',  color: '#89b4fa', style: 'solid' },
    { from: 'config_minio.upload', to: 'ext_minio.bucket', color: '#fab387', style: 'solid' },

    // Config → External
    { from: 'config_db.pool', to: 'ext_postgres.db',       color: '#fab387', style: 'solid' },
    { from: 'config_redis.client', to: 'ext_redis.cache',  color: '#fab387', style: 'solid' },
    { from: 'config_minio.client', to: 'ext_minio.bucket',color: '#fab387', style: 'solid' },

    // Server → Socket.IO
    { from: 'server.io', to: 'ext_socket.events',         color: '#fab387', style: 'solid' },
  ]
};
