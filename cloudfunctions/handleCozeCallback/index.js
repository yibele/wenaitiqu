// cloudfunctions/handleCozeCallback/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// --- 安全配置 ---
// 自定义密钥词，需要与Coze端保持一致
const SECRET_WORD = process.env.COZE_SECRET_WORD || 'mayixxzd2024';
// 时间戳有效窗口，单位：毫秒。例如10分钟。
const TIMESTAMP_VALIDITY = 10 * 60 * 1000;

/**
 * 简单的自定义加密函数
 * @param {string} text - 要加密的文本
 * @param {string} key - 密钥
 * @returns {string} - 加密后的字符串
 */
function simpleEncrypt(text, key) {
  let result = '';
  const keyLength = key.length;
  
  for (let i = 0; i < text.length; i++) {
    // 获取字符的ASCII码
    const textChar = text.charCodeAt(i);
    const keyChar = key.charCodeAt(i % keyLength);
    
    // 简单的异或加密 + 位移
    const encrypted = (textChar ^ keyChar) + (i % 256);
    
    // 转换为16进制字符串，确保长度一致
    result += encrypted.toString(16).padStart(4, '0');
  }
  
  return result;
}

/**
 * 生成验证签名
 * @param {string} timestamp - 时间戳
 * @param {string} secretWord - 密钥词
 * @returns {string} - 生成的签名
 */
function generateSignature(timestamp, secretWord) {
  // 将密钥词和时间戳组合
  const combined = `${secretWord}_${timestamp}`;
  return simpleEncrypt(combined, secretWord);
} 

/**
 * 接收第三方API回调的云函数 (最终安全版)
 */
exports.main = async (event, context) => {
  console.log('[回调接收]', event.headers)

  // --- 1. 安全验证层 ---
  try {
    const timestamp = event.headers['x-coze-timestamp'];
    const signature = event.headers['x-coze-signature'];

    if (!timestamp || !signature) {
      throw new Error('Missing required security headers');
    }

    // a. 验证时间戳 (防止重放攻击)
    const now = Date.now();
    const timeDifference = now - parseInt(timestamp, 10);
    if (timeDifference > TIMESTAMP_VALIDITY) {
      throw new Error(`Timestamp expired. Received: ${timestamp}, Now: ${now}`);
    }

    // b. 验证签名 (使用自定义加密函数)
    const expectedSignature = generateSignature(timestamp, SECRET_WORD);

    if (signature !== expectedSignature) {
      throw new Error(`Signature mismatch.`);
    }

    console.log('[安全验证通过]');

  } catch (securityError) {
    console.error('[安全验证失败]', securityError.message);
    // 对于安全验证失败的请求，我们返回401 Unauthorized错误
    // 这有助于将恶意或配置错误的请求与程序内部错误区分开
    return {
      statusCode: 401,
      body: `Unauthorized: ${securityError.message}`
    }
  }

  // --- 2. 业务逻辑层 ---
  // 只有通过安全验证的请求，才能到达这里
  try {
    const callbackData = JSON.parse(event.body)
    const { correlation_id, status, result } = callbackData

    if (!correlation_id || !status || result === undefined) {
      throw new Error('Missing required fields in body');
    }

    console.log(`[回调处理] Job ID: ${correlation_id}, 状态: ${status}`)

    // 首先，获取job文档以备后用（我们需要里面的openid）
    const jobRecord = await db.collection('coze_jobs').doc(correlation_id).get()
    if (!jobRecord.data) {
      throw new Error(`Job with id ${correlation_id} not found.`);
    }

    await db.collection('coze_jobs').doc(correlation_id).update({
      data: {
        status: status,
        finishTime: new Date(),
        result: result
      }
    })

    console.log(`[回调成功] Job ID: ${correlation_id} 已更新`)

    // --- 3. 发送订阅消息 ---
    // 只有在任务成功时才发送通知
    
      try {
       
        await cloud.openapi.subscribeMessage.send({
          touser: 'o3Ory5J6OTVR04HcJLOu2qYmbOSA',
          page: 'pages/index/index',
          templateId: 'j41qf196-RzeupqQ2fm57cHi8sSDR0OckHAY9ehagiI', 
          data: {
            time2: {
              value: "2025年8月20日 14:00"
            },
            character_string3: {
              value:  'https://www.baidu.com'
            }
          },
          miniprogramState: 'trial' // 'developer':开发版; 'trial':体验版; 'formal':正式版
        })
        console.log(`[订阅消息] 发送成功 to o3Ory5J6OTVR04HcJLOu2qYmbOSA`);
      } catch (msgError) {
        console.error(`[订阅消息] 发送失败 for job ${correlation_id}:`, msgError);
        // 注意：这里我们只记录错误，不影响主流程的成功返回
        // 因为回调本身已经处理成功了，消息推送是附加功能
      }
  

    
    // 向 Coze 服务器返回成功接收的响应
    return {
      errCode: 0,
      errMsg: 'Callback processed successfully.'
    }

  } catch (logicError) {
    console.error(`[业务逻辑失败]`, logicError)
    // 对于程序内部错误，我们返回500 Internal Server Error
    return {
      statusCode: 500,
      body: `Internal Server Error: ${logicError.message}`
    }
  }
}