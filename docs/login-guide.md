# 静默登录功能使用指南

## 功能概述

本小程序已集成了完整的静默登录功能，用户无需手动登录即可自动获取用户身份，并记录用户的行为数据。

## 主要功能

### 1. 自动登录
- ✅ 用户打开小程序时自动获取 openid
- ✅ 自动创建或更新用户记录
- ✅ 显示初始化进度

### 2. 用户数据管理
- ✅ 自动记录用户提取文案次数
- ✅ 自动记录用户分享次数
- ✅ 积分系统（分享获得10积分）
- ✅ 记录用户创建时间和最后登录时间

### 3. 数据库集成
- ✅ 基于云开发数据库
- ✅ 符合 database.md 设计规范
- ✅ 自动处理新用户和老用户

## 技术实现

### 云函数
- **login**: 获取用户 openid 的云函数
- 位置: `/cloudfunctions/login/`

### 应用入口 (app.ts)
- `silentLogin()`: 静默登录主方法
- `createOrUpdateUser()`: 创建或更新用户记录
- `getUserInfo()`: 获取当前用户信息
- `updateExtractCount()`: 更新提取次数
- `updateShareCount()`: 更新分享次数

### 页面集成 (index.ts)
- 解析视频时自动更新提取次数
- 用户头像按钮显示用户统计信息
- 分享功能集成并自动更新分享次数

## 部署配置

### 1. 云开发环境配置
```javascript
// 在 app.ts 中配置你的云开发环境ID
wx.cloud.init({
  env: 'YOUR_CLOUD_ENV_ID', // 替换为实际的环境ID
  traceUser: true,
});
```

### 2. 数据库配置
- 创建名为 `users` 的集合
- 使用 database.md 中定义的字段结构
- 系统会自动为 `_openid` 创建索引

### 3. 云函数部署
```bash
# 进入云函数目录
cd cloudfunctions/login

# 安装依赖
npm install

# 上传并部署云函数
# 在微信开发者工具中右键点击 login 文件夹选择"上传并部署"
```

## 用户体验流程

1. **用户打开小程序**
   - 显示"初始化中..."加载提示
   - 自动调用云函数获取 openid
   - 查询或创建用户记录

2. **首次使用用户**
   - 自动创建新用户记录
   - 初始化所有统计数据为0

3. **老用户**
   - 更新最后登录时间
   - 加载历史统计数据

4. **解析视频**
   - 检查登录状态
   - 成功解析后自动增加提取次数

5. **查看统计**
   - 点击右下角用户头像
   - 显示提取次数、分享次数、积分

6. **分享功能**
   - 通过用户信息弹框分享
   - 自动增加分享次数和积分

## 错误处理

- 网络错误时显示友好提示
- 云函数调用失败时的降级处理
- 数据库操作异常的错误捕获

### 常见错误及解决方案

#### 1. `Invalid Key Name: _openid` 错误
**错误信息**: `errCode: -501007 invalid parameters | errMsg: Invalid Key Name: _openid`

**原因**: 在云开发数据库中，`_openid` 是系统保留字段，会自动注入，不能手动设置。

**解决方案**: 
- ✅ 已修复：移除了手动设置 `_openid` 的代码
- ✅ 云开发会自动为每条记录注入用户的 `_openid`
- ✅ 查询时直接使用集合查询，系统会自动基于当前用户的 `_openid` 过滤

#### 2. 云函数调用失败
**解决方案**: 
- 确保云函数已正确部署
- 检查云开发环境ID配置
- 查看云函数日志排查问题

## 隐私保护

- 仅使用微信提供的 openid
- 不收集任何个人敏感信息
- 数据仅用于统计和功能优化

## 维护说明

### 数据清理
```javascript
// 清理测试数据（谨慎使用）
const db = wx.cloud.database();
await db.collection('users').where({
  extract_count: 0,
  share_count: 0
}).remove();
```

### 数据分析
```javascript
// 获取用户统计信息
const db = wx.cloud.database();
const stats = await db.collection('users').aggregate()
  .group({
    _id: null,
    totalUsers: { $sum: 1 },
    totalExtracts: { $sum: '$extract_count' },
    totalShares: { $sum: '$share_count' }
  })
  .end();
```

## 注意事项

1. **云开发环境**: 确保配置正确的云开发环境ID
2. **权限设置**: 确保数据库权限允许小程序端读写
3. **云函数**: 确保login云函数正确部署
4. **网络**: 功能依赖网络连接，离线状态下会有降级处理
