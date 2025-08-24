// cloudfunctions/startJob/index.js

// 引入微信云开发服务端 SDK
const cloud = require('wx-server-sdk')
const axios = require('axios')
// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV // 使用当前云环境
})

// 获取数据库引用
const db = cloud.database()


// Coze API 配置
const COZE_CONFIG = {
  BASE_URL: 'https://api.coze.cn',
  AUTH_TOKEN: 'sat_IYKfCL5LZ640EHqXBgUqFN1NrMdo8JS0hG35mbXNHtSH7D8zh9l6ExkaQBRRRBYF',
  WORKFLOW_ID: '7538820814680014898'
}

// 发送提取任务
async function sendExtractTask(input) {
  const requestData = {
    workflow_id: COZE_CONFIG.WORKFLOW_ID,
    parameters: {
      url: input.url,
      _id: input._id,
      openid: input.openid
    },
    is_async: true
  };
  
  console.log('准备发送 Coze API 请求:', {
    url: `${COZE_CONFIG.BASE_URL}/v1/workflow/run`,
    data: requestData
  });
  
  try {
    const response = await axios.post(
      `${COZE_CONFIG.BASE_URL}/v1/workflow/run`,
      requestData,
      {
        headers: {
          Authorization: `Bearer ${COZE_CONFIG.AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30秒超时
      }
    );

    console.log('Coze API 响应:', response.data);
    
    const result = response.data;
    if (result.code !== 0) {
      throw new Error(`Coze API 返回错误: code=${result.code}, msg=${result.msg}`);
    }

    if (!result.execute_id) {
      throw new Error('Coze API 响应中缺少 execute_id');
    }

    return result.execute_id;
  } catch (error) {
    console.error('Coze API 调用详细错误:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
    
    if (error.response) {
      // API 返回了错误响应
      throw new Error(`Coze API 调用失败: ${error.response.status} ${error.response.statusText}`);
    } else if (error.request) {
      // 请求发送了但没有收到响应
      throw new Error('Coze API 请求超时或网络错误');
    } else {
      // 其他错误
      throw new Error(`Coze API 调用配置错误: ${error.message}`);
    }
  }
}
/**
 * 通用任务启动云函数
 * @param {object} event 前端调用时传入的参数
 * @param {string} event.type 任务类型, 例如 'video_copy' 或 'account_analysis'
 * @param {object} event.params 调用API所需的具体参数
 * @returns {object} 包含任务ID { success: boolean, jobId: string }
 */
exports.main = async (event, context) => {
  try {
    // 从上下文获取调用者的 openid
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    console.log('startJob 云函数被调用:', { openid, event });

    // 从前端调用参数中解构出任务类型和具体参数
    const { type, params } = event

    // 行级注释: 参数验证
    if (!type) {
      throw new Error('缺少必需参数: type');
    }
    if (!params) {
      throw new Error('缺少必需参数: params');
    }
    if (type === 'get_video_content' && !params.url) {
      throw new Error('get_video_content 任务缺少必需参数: url');
    }

    // 1. 在数据库中创建任务记录，拿到自动生成的 _id
    // 这是关键第一步，我们用这个 _id 作为后续所有流程的关联 ID
    const job = {
      _openid: openid,      // 用户标识
      type: type,           // 任务类型
      params: params,       // 任务所需参数
      status: 'pending',    // 初始状态：等待处理
      createTime: new Date(), // 创建时间
      finishTime: null,     // 完成时间，初始为空
      result: {}           // 任务结果，初始为空对象
    }

    console.log('准备创建任务记录:', job);
    
    // 将任务数据添加到 coze_jobs 集合中
    const { _id } = await db.collection('coze_jobs').add({ data: job })
    

  // 行级注释: 根据任务类型调用相应的API
  try {
    switch (type) {
      case 'get_video_content': // 修正任务类型，与前端保持一致
        console.log('开始调用 Coze API，参数:', params);
        const executeId = await sendExtractTask({
          url: params.url,
          _id: _id,
          openid: openid
        });
        break;
      default:
        throw new Error(`不支持的任务类型: ${type}`);
    }
  } catch (apiError) {
    console.error('API调用失败:', apiError);
    
    // 行级注释: 更新任务状态为失败
    await db.collection('coze_jobs').doc(_id).update({
      data: {
        status: 'failed',
        error: apiError.message || 'API调用失败'
      }
    });
    
    // 行级注释: 返回错误信息给前端
    return { 
      success: false, 
      error: apiError.message || 'API调用失败', 
      jobId: _id 
    };
  }



    // 前端将用这个 ID 来监听任务的后续状态变化
    return {
      success: true,
      jobId: _id
    }
    
  } catch (error) {
    console.error('startJob 云函数执行失败:', error);
    
    // 行级注释: 返回错误信息
    return {
      success: false,
      error: error.message || '未知错误',
      jobId: null
    };
  }
}
