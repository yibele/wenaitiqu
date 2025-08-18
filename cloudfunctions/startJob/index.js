// cloudfunctions/startJob/index.js

// 引入微信云开发服务端 SDK
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV // 使用当前云环境
})

// 获取数据库引用
const db = cloud.database()

/**
 * 通用任务启动云函数
 * @param {object} event 前端调用时传入的参数
 * @param {string} event.type 任务类型, 例如 'video_copy' 或 'account_analysis'
 * @param {object} event.params 调用API所需的具体参数
 * @returns {object} 包含任务ID { success: boolean, jobId: string }
 */
exports.main = async (event, context) => {
  // 从上下文获取调用者的 openid
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 从前端调用参数中解构出任务类型和具体参数
  const { type, params } = event

  console.log(`[任务开始] 类型: ${type}, 用户: ${openid}, 参数:`, params)

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

  // 将任务数据添加到 coze_jobs 集合中
  const { _id } = await db.collection('coze_jobs').add({ data: job })

  // --- 调用 Coze API 分支 --- //
  // 在这一步，我们已经拿到了唯一的 jobId (_id)
  // 我们将使用这个 _id 作为 correlation_id 去调用 Coze 的异步 API

  // TODO: 在未来的步骤中，我们将在这里实现具体的API调用逻辑
  // 示例代码将会是这样:
  /*
  try {
    // const cozeResponse = await axios.post('YOUR_COZE_API_ENDPOINT', {
    //   ...params, // 业务参数
    //   correlation_id: _id // 将我们的jobId作为关联ID传给Coze
    // });

    // 如果API同步返回了某些信息，可以在这里更新job状态
    // await db.collection('coze_jobs').doc(_id).update({
    //   data: { status: 'processing' }
    // });

  } catch (apiError) {
    // 如果调用API当场就失败了，需要记录错误并更新job状态
    console.error('[API调用失败]', apiError);
    await db.collection('coze_jobs').doc(_id).update({
      data: {
        status: 'failed',
        error: 'Failed to call Coze API'
      }
    });
    // 并将错误返回给前端
    return { success: false, error: 'API call failed', jobId: _id };
  }
  */
  console.log(`[任务创建成功] Job ID: ${_id}`)

  // 4. 无论API调用是否在这里实现，都立即将 jobId (_id) 返回给前端
  // 前端将用这个 ID 来监听任务的后续状态变化
  return {
    success: true,
    jobId: _id
  }
}
