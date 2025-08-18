// Webhook处理云函数 - 接收Coze API回调
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// Webhook安全验证密钥（需要在Coze API中配置）
const WEBHOOK_SECRET = '123123123';

exports.main = async (event, context) => {
  console.log('收到Webhook回调:', event);
  
  try {
    // 对于HTTP触发器，请求信息在event中
    const { httpMethod, path, headers, body } = event;
    
    console.log('HTTP请求信息:', { httpMethod, path, headers });
    
   
    if (httpMethod !== 'POST') {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error:"none" })
      };
    }
   
    
    // 1. 验证请求来源（安全检查）
    if (!verifyWebhookSignature(event)) {
      console.error('Webhook签名验证失败');
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }
    
    // 2. 解析webhook数据
    const webhookData = parseWebhookData(event);
    if (!webhookData) {
      console.error('Webhook数据解析失败');
          return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid webhook data' })
    };
    }
    
    // 3. 查找对应的任务记录
    const task = await findTaskByExecuteId(webhookData.executeId);
    if (!task) {
      console.error('未找到对应的任务记录:', webhookData.executeId);
          return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Task not found' })
    };
    }
    
    // 4. 处理任务结果
    const result = await processTaskResult(task, webhookData);
    
    // 5. 发送订阅消息通知用户
    if (result.success) {
      await sendSubscriptionMessage(task._openid, task._id, webhookData);
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Webhook处理成功',
        taskId: task._id
      })
    };
    
  } catch (error) {
    console.error('Webhook处理失败:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};

// 验证webhook签名
function verifyWebhookSignature(event) {
  try {
    const signature = event.headers['x-coze-signature'];
    const timestamp = event.headers['x-coze-timestamp'];
    const body = event.body;
    
    if (!signature || !timestamp || !body) {
      return false;
    }
    
    // 检查时间戳防重放攻击（5分钟内有效）
    /*
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      console.error('时间戳检查失败');
      return false;
    }
    */
    
    // 验证签名
    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(timestamp + body)
      .digest('hex');
    
    // return signature === expectedSignature;
    return signature === WEBHOOK_SECRET
  } catch (error) {
    console.error('签名验证过程出错:', error);
    return false;
  }
}

// 解析webhook数据
function parseWebhookData(event) {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    
    // 根据Coze API的实际回调格式调整
    return {
      executeId: body.execute_id,
      status: body.status, // 'Success' | 'Failed'
      output: body.output,
      error: body.error,
      createdTime: body.created_time,
      finishedTime: body.finished_time
    };
  } catch (error) {
    console.error('解析webhook数据失败:', error);
    return null;
  }
}

// 查找任务记录
async function findTaskByExecuteId(executeId) {
  try {
    const result = await db.collection('tasks')
      .where({
        coze_execute_id: executeId
      })
      .limit(1)
      .get();
    
    return result.data.length > 0 ? result.data[0] : null;
  } catch (error) {
    console.error('查找任务记录失败:', error);
    return null;
  }
}

// 处理任务结果
async function processTaskResult(task, webhookData) {
  try {
    const updateData = {
      webhook_received: true,
      updated_at: new Date()
    };
    
    if (webhookData.status === 'Success') {
      // 任务成功完成
      const extractResult = parseCozeOutput(webhookData.output);
      
      updateData.status = 'completed';
      updateData.result = extractResult;
      updateData.completed_at = new Date();
      updateData.progress = 100;
      
    } else {
      // 任务失败
      updateData.status = 'failed';
      updateData.error_message = webhookData.error || '处理失败';
      updateData.progress = 0;
    }
    
    // 更新数据库
    await db.collection('tasks').doc(task._id).update({
      data: updateData
    });
    
    console.log('任务状态更新成功:', task._id, updateData.status);
    return { success: true, data: updateData };
    
  } catch (error) {
    console.error('处理任务结果失败:', error);
    return { success: false, error: error.message };
  }
}

// 解析Coze输出结果
function parseCozeOutput(output) {
  try {
    if (!output) return null;
    
    // 根据实际的Coze API输出格式调整
    const outputData = typeof output === 'string' ? JSON.parse(output) : output;
    const resultStr = outputData.Output;
    const result = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;
    
    return {
      title: result.title || '',
      content: result.content || '',
      cover: result.photo || '',
      video_url: result.url || ''
    };
  } catch (error) {
    console.error('解析Coze输出失败:', error);
    return null;
  }
}

// 发送订阅消息
async function sendSubscriptionMessage(openid, taskId, webhookData) {
  try {
    // 检查是否已发送过通知
    const task = await db.collection('tasks').doc(taskId).get();
    if (task.data.notification_sent) {
      console.log('订阅消息已发送过，跳过');
      return;
    }
    
    const isSuccess = webhookData.status === 'Success';
    const templateId = isSuccess ? 'success_template_id' : 'failed_template_id';
    
    const messageData = {
      thing1: { // 任务类型
        value: '视频文案提取'
      },
      time2: { // 完成时间
        value: new Date().toLocaleString('zh-CN')
      },
      thing3: { // 处理结果
        value: isSuccess ? '处理成功' : '处理失败'
      }
    };
    
    // 发送订阅消息
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      page: `/pages/index/index?taskId=${taskId}`,
      data: messageData,
      templateId: templateId,
      miniprogramState: 'developer' // 正式版：formal，开发版：developer，体验版：trial
    });
    
    // 标记为已发送
    await db.collection('tasks').doc(taskId).update({
      data: {
        notification_sent: true,
        updated_at: new Date()
      }
    });
    
    console.log('订阅消息发送成功:', openid);
    
  } catch (error) {
    console.error('发送订阅消息失败:', error);
    // 不抛出错误，避免影响主流程
  }
}
