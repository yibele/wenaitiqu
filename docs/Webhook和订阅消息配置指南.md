# 🔗 Webhook和订阅消息配置完整指南

## 🎯 配置概览

新的异步方案需要以下配置：
1. **Coze API Webhook** - 接收任务完成回调
2. **微信订阅消息** - 通知用户任务完成
3. **云函数HTTP触发** - 接收POST请求
4. **数据库权限** - 读写任务集合

## 🔧 1. 云函数HTTP触发配置

### 1.1 创建HTTP触发器配置文件

在 `cloudfunctions/webhookHandler/` 目录下创建 `config.json` 文件：

```json
{
  "triggers": [
    {
      "name": "httpTrigger",
      "type": "http",
      "config": {
        "timeout": 60,
        "envId": "{{envId}}",
        "path": "/webhook/coze"
      }
    }
  ]
}
```

### 1.2 部署云函数

```bash
# 1. 确保文件结构正确：
#    cloudfunctions/webhookHandler/
#    ├── index.js
#    ├── package.json  
#    └── config.json (新增)
#
# 2. 右键 cloudfunctions/webhookHandler
# 3. 选择 "上传并部署: 云端安装依赖"
# 4. 等待部署完成
```

### 1.3 获取云函数HTTP URL

部署完成后，在微信开发者工具中：
1. 进入 **"云开发"** → **"云函数"**
2. 找到 `webhookHandler` 函数
3. 点击函数名进入详情页
4. 查看 **"HTTP 触发"** 标签页
5. 复制访问地址，格式类似：
   ```
   https://your-env-id-1234567890.service.tcloudbase.com/webhookHandler/webhook/coze
   ```

**这个URL就是要配置给Coze API的webhook地址**

⚠️ **注意**：如果没有看到HTTP触发器，请检查：
- `config.json` 文件格式是否正确
- 重新部署云函数
- 查看云函数控制台日志

## 📱 2. 微信订阅消息配置

### 2.1 在微信公众平台配置

1. 登录 [微信公众平台](https://mp.weixin.qq.com)
2. 进入 "功能" → "订阅消息"
3. 申请模板消息

### 2.2 推荐的模板格式

#### 成功模板
```
模板标题：任务处理完成
模板内容：
{{thing1.DATA}}
完成时间：{{time2.DATA}}
处理结果：{{thing3.DATA}}
```

#### 失败模板
```
模板标题：任务处理失败
模板内容：
{{thing1.DATA}}
失败时间：{{time2.DATA}}
失败原因：{{thing4.DATA}}
```

### 2.3 获取模板ID

审核通过后，获取模板ID，更新到云函数代码中：

```javascript
// cloudfunctions/webhookHandler/index.js
const templateId = isSuccess ? 'your_success_template_id' : 'your_failed_template_id';
```

## 🌐 3. Coze API Webhook配置

### 3.1 在Coze控制台配置

```json
{
  "webhook_url": "https://your-env-id.service.tcloudbase.com/webhookHandler/webhook/coze",
  "secret": "your-webhook-secret-key",
  "events": ["workflow.execution.completed", "workflow.execution.failed"]
}
```

### 3.2 安全密钥设置

在云函数中设置相同的密钥：

```javascript
// cloudfunctions/webhookHandler/index.js
const WEBHOOK_SECRET = 'your-webhook-secret-key'; // 与Coze配置保持一致
```

## 📊 4. 数据库权限配置

### 4.1 创建tasks集合

在云数据库中创建 `tasks` 集合，权限设置：

```json
{
  "read": "auth != null",
  "write": "auth != null",
  "create": "auth != null",
  "update": "auth != null"
}
```

### 4.2 初始化数据结构

参考 `docs/任务数据库设计.md` 中的完整结构。

## 🔄 5. 修改现有extractText云函数

### 5.1 添加任务创建逻辑

```javascript
// cloudfunctions/extractText/index.js 修改
async function sendTaskToCoze(input, openid) {
  // 1. 调用Coze API
  const executeResult = await callCozeAPI(input);
  
  // 2. 创建任务记录
  const taskData = {
    task_uuid: generateUUID(),
    status: 'processing',
    coze_execute_id: executeResult.executeId,
    input_url: input,
    result: null,
    error_message: null,
    progress: 0,
    retry_count: 0,
    webhook_received: false,
    notification_sent: false,
    created_at: new Date(),
    updated_at: new Date(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
  };
  
  const taskResult = await db.collection('tasks').add({
    data: taskData
  });
  
  return {
    success: true,
    taskId: taskResult._id,
    executeId: executeResult.executeId
  };
}
```

## 🎮 6. 前端监听配置

### 6.1 数据库实时监听

```typescript
// miniprogram/pages/index/index.ts
async startTaskMonitoring(taskId: string) {
  const db = wx.cloud.database();
  
  // 监听任务状态变化
  const watcher = db.collection('tasks').doc(taskId).watch({
    onChange: (snapshot) => {
      console.log('任务状态变化:', snapshot.docs[0]);
      const task = snapshot.docs[0];
      
      if (task.status === 'completed') {
        // 任务完成，显示结果
        this.showTaskResult(task.result);
        watcher.close(); // 关闭监听
      } else if (task.status === 'failed') {
        // 任务失败，显示错误
        this.showTaskError(task.error_message);
        watcher.close();
      }
    },
    onError: (error) => {
      console.error('监听任务状态失败:', error);
    }
  });
}
```

### 6.2 订阅消息授权

```typescript
// 在提交任务前请求订阅消息授权
async requestSubscriptionPermission() {
  try {
    const result = await wx.requestSubscribeMessage({
      tmplIds: ['your_success_template_id', 'your_failed_template_id']
    });
    
    console.log('订阅消息授权结果:', result);
    return result;
  } catch (error) {
    console.error('订阅消息授权失败:', error);
    return null;
  }
}
```

## 🧪 7. 测试验证

### 7.1 测试步骤

1. **部署云函数**：确保 webhookHandler 正确部署
2. **配置Webhook**：在Coze控制台配置回调URL
3. **测试回调**：提交测试任务，检查webhook是否正常接收
4. **验证消息**：确认订阅消息正常发送
5. **检查数据**：验证数据库任务状态正确更新

### 7.2 调试日志

在云函数日志中查看：
```
收到Webhook回调: {...}
任务状态更新成功: task_id completed
订阅消息发送成功: openid
```

## ⚠️ 8. 注意事项

### 8.1 安全考虑
- ✅ 启用webhook签名验证
- ✅ 设置时间戳防重放攻击
- ✅ 验证请求来源

### 8.2 容错机制
- ✅ webhook处理失败不影响Coze API
- ✅ 订阅消息发送失败不影响任务更新
- ✅ 设置任务过期时间，定期清理

### 8.3 性能优化
- ✅ 数据库索引优化
- ✅ 避免重复发送通知
- ✅ 异步处理非关键操作

## 📈 预期效果

配置完成后的用户体验：
1. 用户提交视频链接 → 立即返回"任务已提交"
2. 用户可关闭页面 → 后台处理，0消耗
3. 处理完成 → 自动收到微信通知
4. 点击通知 → 直接查看结果

**响应时间从5秒轮询降低到1秒内实时通知！**
