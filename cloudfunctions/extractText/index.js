// 云函数入口文件
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// Coze API 配置
const COZE_CONFIG = {
  BASE_URL: 'https://api.coze.cn',
  AUTH_TOKEN: 'sat_IYKfCL5LZ640EHqXBgUqFN1NrMdo8JS0hG35mbXNHtSH7D8zh9l6ExkaQBRRRBYF',
  WORKFLOW_ID: '7535294053631819826'
}

// 发送提取任务
async function sendExtractTask(input) {
  const requestData = {
    workflow_id: COZE_CONFIG.WORKFLOW_ID,
    parameters: { input },
    is_async: true
  };
  
  console.log('发送任务请求数据:', JSON.stringify(requestData, null, 2));
  console.log('使用的Auth Token:', COZE_CONFIG.AUTH_TOKEN.substring(0, 20) + '...');
  
  const response = await axios.post(
    `${COZE_CONFIG.BASE_URL}/v1/workflow/run`,
    requestData,
    {
      headers: {
        Authorization: `Bearer ${COZE_CONFIG.AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  console.log('发送任务响应状态:', response.status);
  console.log('发送任务响应数据:', JSON.stringify(response.data, null, 2));

  const result = response.data;
  if (result.code !== 0) {
    throw new Error(`发送任务失败: ${result.msg}`);
  }

  return result.execute_id;
}

// 查询任务结果
async function getTaskResult(executeId) {
  const queryUrl = `${COZE_CONFIG.BASE_URL}/v1/workflows/${COZE_CONFIG.WORKFLOW_ID}/run_histories/${executeId}`;
  console.log('查询URL:', queryUrl);
  console.log('执行ID:', executeId);
  
  const response = await axios.get(queryUrl, {
    headers: {
      Authorization: `Bearer ${COZE_CONFIG.AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  const result = response.data;
  if (result.code !== 0) {
    throw new Error(`查询任务失败: ${result.msg}`);
  }

  return result.data;
}

// 解析输出结果
function parseOutput(data) {
  console.log('开始解析输出结果, 原始数据:', JSON.stringify(data, null, 2));
  
  if (!data || data.length === 0) {
    throw new Error('没有找到执行结果')
  }

  const taskData = data[0];
  console.log('任务数据:', JSON.stringify(taskData, null, 2));
  console.log('任务状态:', taskData.execute_status);
  
  if (taskData.execute_status !== 'Success') {
    throw new Error(`任务执行失败，状态: ${taskData.execute_status}`)
  }

  // 解析输出数据
  const outputStr = taskData.output;
  console.log('输出字符串:', outputStr);
  
  if (!outputStr) {
    throw new Error('输出数据为空');
  }
  
  const outputData = JSON.parse(outputStr);
  console.log('解析后的输出数据:', JSON.stringify(outputData, null, 2));
  
  const resultStr = outputData.Output;
  console.log('结果字符串:', resultStr);
  
  if (!resultStr) {
    throw new Error('Output字段为空');
  }
  
  const result = JSON.parse(resultStr);
  console.log('最终解析结果:', JSON.stringify(result, null, 2));

  return {
    content: result.content || '',
    photo: result.photo || '',
    title: result.title || '',
    url: result.url || ''
  };
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, input, executeId } = event

  try {
    if (action === 'sendTask') {
      // 发送提取任务
      if (!input || !input.trim()) {
        return {
          success: false,
          error: '请输入视频链接',
          code: 'INVALID_INPUT'
        }
      }

      console.log('发送提取任务，输入:', input)
      const taskExecuteId = await sendExtractTask(input.trim())
      console.log('任务已发送，执行ID:', taskExecuteId)

      return {
        success: true,
        data: { executeId: taskExecuteId }
      }
    } 
    else if (action === 'queryTask') {
      // 查询任务结果
      if (!executeId) {
        return {
          success: false,
          error: '缺少执行ID',
          code: 'MISSING_EXECUTE_ID'
        }
      }

      console.log('查询任务结果，执行ID:', executeId)
      const data = await getTaskResult(executeId)

      // 增强调试信息
      console.log('查询到的数据长度:', data ? data.length : 0)
      console.log('查询到的原始数据:', JSON.stringify(data, null, 2))

      if (!data || data.length === 0) {
        console.log('查询结果为空，任务可能还在执行中')
        return {
          success: false,
          status: 'running',
          message: '任务执行中，请稍候...'
        }
      }

      const taskData = data[0]
      console.log('任务状态详情:', {
        execute_status: taskData.execute_status,
        create_time: taskData.create_time,
        update_time: taskData.update_time,
        hasOutput: !!taskData.output
      })
      
      if (taskData.execute_status === 'Success') {
        // 检查是否有输出数据
        if (!taskData.output) {
          console.log('任务成功但输出为空')
          return {
            success: false,
            status: 'failed',
            error: '任务完成但未获取到结果数据'
          }
        }
        
        try {
          const result = parseOutput(data)
          console.log('任务执行成功，解析结果:', result)
          return {
            success: true,
            status: 'success',
            data: result
          }
        } catch (parseError) {
          console.error('解析结果失败:', parseError)
          return {
            success: false,
            status: 'failed',
            error: `结果解析失败: ${parseError.message}`
          }
        }
      } 
      else if (taskData.execute_status === 'Failed') {
        console.log('任务执行失败')
        return {
          success: false,
          status: 'failed',
          error: taskData.error_message || '任务执行失败'
        }
      } 
      else {
        console.log('任务仍在执行中，状态:', taskData.execute_status)
        return {
          success: false,
          status: 'running',
          message: `任务状态: ${taskData.execute_status}`
        }
      }
    } 
    else if (action === 'updateExtractCount') {
      // 行级注释: 更新用户提取次数
      console.log('更新用户提取次数');
      
      try {
        // 行级注释: 这里可以添加数据库操作来更新用户提取次数
        // 目前只返回成功，实际项目中需要连接数据库
        console.log('用户提取次数更新成功');
        
        return {
          success: true,
          message: '用户提取次数更新成功'
        }
      } catch (updateError) {
        console.error('更新用户提取次数失败:', updateError);
        return {
          success: false,
          error: '更新用户提取次数失败',
          code: 'UPDATE_COUNT_ERROR'
        }
      }
    }
    else {
      return {
        success: false,
        error: '无效的操作类型',
        code: 'INVALID_ACTION'
      }
    }
  } catch (error) {
    console.error('云函数执行失败:', error)
    return {
      success: false,
      error: error.message || '操作失败，请重试',
      code: 'FUNCTION_ERROR'
    }
  }
}
