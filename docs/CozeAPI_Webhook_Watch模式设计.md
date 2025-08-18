# CozeAPI Webhook + Watch 模式设计文档

## 概述

本文档描述了从前端轮询模式改为CozeAPI Webhook + 前端Watch模式的架构设计。新模式通过异步处理和事件驱动的方式，大幅提升系统性能，减少不必要的请求。

## 当前模式问题

### 前端轮询模式缺点
- **性能低下**: 前端需要不断发送请求检查任务状态
- **资源浪费**: 大量无效的轮询请求消耗服务器资源
- **用户体验差**: 轮询间隔导致状态更新延迟
- **扩展性差**: 用户量增加时轮询请求呈线性增长

## 新架构模式：CozeAPI Webhook + Watch

### 架构流程图

```
前端页面
    ↓ 1. 发送任务请求 + 创建Watch监听 
云函数 (extractText/createContent等)
    ↓ 2. 处理请求参数
数据库 coze_jobs 表
    ↓ 3. 创建任务记录 (status: 'pending')
CozeAPI 调用
    ↓ 4. 异步处理任务
CozeAPI Webhook 回调
    ↓ 5. 任务完成回调
webhookHandler 云函数
    ↓ 6. 更新coze_jobs状态 (status: 'completed'/'failed')
数据库实时监听
    ↓ 7. 触发Watch回调
前端 Watch 回调
    ↓ 8. 更新UI + 关闭Watch
```

## 详细实现流程

### 1. 前端发起任务
```javascript
// 前端创建任务并设置监听
const taskId = generateTaskId(); // 生成唯一的任务ID
const watchHandler = setupDatabaseWatch(taskId);

// 发送任务请求
wx.cloud.callFunction({
  name: 'extractText', // 具体的云函数名称
  data: {
    taskId: taskId,
    // 其他业务参数...
  }
});
```

### 2. 云函数处理
```javascript
// 云函数 extractText/index.js
exports.main = async (event, context) => {
  const { taskId, ...otherParams } = event;
  const { OPENID } = wx.getWXContext();

  // 1. 在 coze_jobs 集合中创建任务记录
  await db.collection('coze_jobs').add({
    data: {
      _id: taskId, // 使用前端生成的taskId作为_id
      _openId: OPENID,
      createTime: new Date(),
      error: null,
      finishTime: '',
      result: {},
      status: 'pending',
      type: 'extractText' // 任务类型，用于区分不同任务
    }
  });
  
  // 2. 异步调用 Coze API
  callCozeAPI({
    _id: taskId,
    _openId: OPENID,
    input: otherParams // 传递其他业务参数
  });
  
  // 3. 立即返回，告知前端任务已提交
  return { taskId: taskId, status: 'submitted' };
};
```

### 3. 数据库 coze_jobs 表设计
`coze_jobs` 集合用于记录所有异步任务的状态。通过 `type` 字段来区分不同的业务任务。
```javascript
// coze_jobs 集合字段设计
{
    _id : "",         // 任务ID，由前端生成，唯一标识
    _openId : "",     // 用户OpenID，用于后续发送订阅消息
    createTime : "",  // 任务创建时间
    finishTime : "",  // 任务完成时间
    error : null,     // 任务错误信息
    result : {},      // 任务成功返回的结果
    status: 'pending',// 任务状态: pending, completed, failed
    type : ""         // 任务类型, e.g., 'extractText', 'createContent'
}
```

### 4. CozeAPI调用配置
调用 Coze API 时为异步触发，无需等待其返回结果。关键是需要将任务的 `_id` 和用户的 `_openId` 传递给 Coze。
Coze API 完成任务后，会通过配置的 Webhook 地址回调 `webhookHandler` 云函数，并在回调请求体中携带 `_id` 以便关联任务。

### 5. Webhook处理器
```javascript
// webhookHandler/index.js
exports.main = async (event, context) => {
  // 从 Coze 回调请求中解析出 taskId 和结果
  const { _id, status, result, error } = JSON.parse(event.body);
  
  // 根据 _id 更新数据库记录
  await db.collection('coze_jobs').doc(_id).update({
    data: {
      status: status, // 'completed' or 'failed'
      result: result || {},
      error: error || null,
      finishTime: new Date()
    }
  });
  
  // (可选) 根据 status 和 _openId 发送订阅消息通知用户
  
  return { statusCode: 200, body: 'OK' };
};
```

### 6. 前端Watch监听
```javascript
// 前端数据库监听实现
const setupDatabaseWatch = (taskId) => {
  const watcher = wx.cloud.database().collection('coze_jobs')
    .doc(taskId) // 直接监听指定ID的文档
    .watch({
      onChange: (snapshot) => {
        // snapshot.docs[0] 包含了更新后的文档数据
        if (snapshot.docs.length > 0) {
          const job = snapshot.docs[0];
          
          switch (job.status) {
            case 'completed':
              handleTaskCompleted(job.result); // 使用 result 字段
              closeWatch();
              break;
            case 'failed':
              handleTaskFailed(job.error); // 使用 error 字段
              closeWatch();
              break;
          }
        }
      },
      onError: (error) => {
        console.error('Watch error:', error);
        closeWatch();
      }
    });
  
  const closeWatch = () => {
    watcher.close();
  };
  
  return { watcher, closeWatch };
};
```

## 核心优势

### 1. 性能提升
- **零轮询**: 完全消除前端轮询请求
- **实时响应**: 任务完成即时通知前端
- **资源节约**: 大幅减少服务器请求压力

### 2. 用户体验
- **即时反馈**: 任务状态变化立即体现
- **进度跟踪**: 可以实现更细粒度的进度显示
- **错误处理**: 快速的错误反馈机制

### 3. 系统扩展性
- **水平扩展**: 支持更多并发用户
- **解耦设计**: 前端、后端、第三方API解耦
- **容错能力**: Webhook失败时的重试机制

## 实现要点

### 1. Webhook安全性
```javascript
// Webhook验证签名
const verifyWebhookSignature = (payload, signature, secret) => {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const computedSignature = hmac.digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(computedSignature, 'hex')
  );
};
```

### 2. Watch连接管理
```javascript
// 前端Watch连接池管理
class WatchManager {
  constructor() {
    this.watchers = new Map();
  }
  
  addWatch(taskId, watchHandler) {
    this.watchers.set(taskId, watchHandler);
    
    // 设置超时自动关闭
    setTimeout(() => {
      this.closeWatch(taskId);
    }, 300000); // 5分钟超时
  }
  
  closeWatch(taskId) {
    const watcher = this.watchers.get(taskId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(taskId);
    }
  }
  
  closeAllWatches() {
    this.watchers.forEach(watcher => watcher.close());
    this.watchers.clear();
  }
}
```

### 3. 错误处理和重试
```javascript
// Webhook重试机制
const webhookRetry = async (taskId, retryCount = 0) => {
  const maxRetries = 3;
  
  if (retryCount >= maxRetries) {
    // 标记任务失败
    await updateJobStatus(taskId, 'failed', '重试次数超限');
    return;
  }
  
  try {
    // 重新调用CozeAPI
    await callCozeAPI(taskId);
  } catch (error) {
    // 延迟重试
    setTimeout(() => {
      webhookRetry(taskId, retryCount + 1);
    }, Math.pow(2, retryCount) * 1000); // 指数退避
  }
};
```

## 迁移计划

### 阶段1: 基础设施搭建
1. 创建coze_jobs数据库集合
2. 实现webhookHandler云函数
3. 配置Webhook URL和安全验证

### 阶段2: 核心功能改造
1. 修改extractText云函数支持异步模式
2. 实现前端Watch监听机制
3. 测试端到端流程

### 阶段3: 功能扩展
1. 其他云函数迁移到新模式
2. 添加进度跟踪和错误处理
3. 性能优化和监控

### 阶段4: 上线和监控
1. 灰度发布新模式
2. 监控系统性能指标
3. 逐步移除旧的轮询代码

## 注意事项

1. **数据库连接数限制**: 注意小程序数据库Watch连接数限制
2. **Webhook可靠性**: 需要考虑Webhook失败的重试机制
3. **任务超时处理**: 设置合理的任务超时时间
4. **用户体验**: Watch断开时的友好提示
5. **测试覆盖**: 充分测试各种异常情况

## 总结

CozeAPI Webhook + Watch模式是一个现代化的异步处理架构，能够显著提升系统性能和用户体验。通过事件驱动的设计，实现了前端、后端和第三方API的完全解耦，为系统的扩展和维护提供了良好的基础。
