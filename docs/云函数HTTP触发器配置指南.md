# 🔧 微信云函数HTTP触发器配置指南

## ⚠️ 重要说明

微信小程序云函数的HTTP触发器配置与我之前的描述有所不同，需要使用特定的格式。

## 📝 正确配置步骤

### 1. 创建 config.json 文件

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

### 2. 文件结构确认

确保您的云函数目录结构如下：
```
cloudfunctions/webhookHandler/
├── index.js           # 云函数主文件
├── package.json       # 依赖配置
└── config.json        # HTTP触发器配置 (新增)
```

### 3. 部署云函数

在微信开发者工具中：
1. 右键 `cloudfunctions/webhookHandler` 
2. 选择 **"上传并部署: 云端安装依赖"**
3. 等待部署完成

### 4. 获取HTTP访问地址

部署成功后，在云函数列表中：
1. 找到 `webhookHandler` 函数
2. 点击函数名进入详情
3. 查看 **"HTTP 触发"** 标签页
4. 复制访问地址，格式类似：
   ```
   https://your-env-id-1234567890.service.tcloudbase.com/webhookHandler/webhook/coze
   ```

## 🔍 常见问题解决

### 问题1: "请确认 config.json 中包含合法的 triggers 字段"

**解决方案**：
- 确保 `config.json` 文件格式正确
- 确保 JSON 语法没有错误
- 重新部署云函数

### 问题2: 部署后没有HTTP触发器

**解决方案**：
```bash
# 1. 检查 config.json 文件是否存在
# 2. 重新上传并部署
# 3. 在云控制台检查触发器配置
```

### 问题3: HTTP请求404

**可能原因**：
- 路径配置不正确
- 云函数未正确响应HTTP请求

**解决方案**：
```javascript
// 确保云函数返回正确的HTTP响应格式
exports.main = async (event, context) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      success: true,
      message: 'Webhook received'
    })
  };
};
```

## 🧪 测试HTTP触发器

### 1. 使用微信开发者工具测试

在云函数控制台：
1. 选择 `webhookHandler` 函数
2. 点击 **"测试"**
3. 选择 **"HTTP 触发器测试"**
4. 发送测试请求

### 2. 使用外部工具测试

```bash
# 使用 curl 测试
curl -X POST \
  'https://your-env-id.service.tcloudbase.com/webhookHandler/webhook/coze' \
  -H 'Content-Type: application/json' \
  -d '{
    "test": "webhook test data"
  }'
```

### 3. 查看日志

在云函数控制台查看运行日志，确认请求是否正确接收。

## 📋 完整配置清单

### ✅ 配置文件检查
- [ ] `index.js` - 云函数主逻辑
- [ ] `package.json` - 依赖配置
- [ ] `config.json` - HTTP触发器配置

### ✅ 部署检查
- [ ] 云函数部署成功
- [ ] HTTP触发器已生成
- [ ] 获取到访问URL

### ✅ 功能测试
- [ ] HTTP请求能正常接收
- [ ] 返回正确的状态码
- [ ] 日志显示正常

## 🔗 配置Coze API Webhook

获取到HTTP地址后，在Coze控制台配置：

```json
{
  "webhook_url": "https://your-env-id.service.tcloudbase.com/webhookHandler/webhook/coze",
  "secret": "your-webhook-secret-key",
  "events": ["workflow.execution.completed", "workflow.execution.failed"]
}
```

## 💡 最佳实践

### 1. 安全配置
- 设置合理的超时时间（60秒）
- 验证webhook签名
- 限制请求来源

### 2. 性能优化
- 异步处理非关键操作
- 合理设置数据库索引
- 添加错误重试机制

### 3. 监控调试
- 添加详细的日志记录
- 监控函数执行时间
- 设置告警机制

现在按照这个正确的方式配置，应该就不会报错了！
