import Message from 'tdesign-miniprogram/message/index';
// index.ts
const app = getApp();

// Coze API 配置（前端直接调用）
const COZE_CONFIG = {
  BASE_URL: 'https://api.coze.cn',
  AUTH_TOKEN: 'sat_IYKfCL5LZ640EHqXBgUqFN1NrMdo8JS0hG35mbXNHtSH7D8zh9l6ExkaQBRRRBYF',
  WORKFLOW_ID: '7535294053631819826'
};

// 视频提取结果接口
interface ExtractResult {
  content: string;
  photo: string;
  title: string;
  url: string;
}

Page({
  data: {
    videoUrl: '', // 用户输入的视频链接
    parsing: false, // 解析按钮 loading
    showResult: false, // 结果弹框
    isContentUnlocked: false, // 内容是否已解锁
    result: {
      cover: '',
      title: '',
      content: '',
      url: ''
    },
    displayContent: '', // 当前显示的内容（预览或完整）
    // 行级注释：配置项相关数据
    homeFooterInfo1: '支持平台：抖音 小红书 B站 快手',
    homeFooterInfo2: '复制文案和下载视频需要观看激励视频广告'
  },

  // 显示消息提示
  showMessage(content: string, _theme: 'info' | 'success' | 'warning' | 'error' = 'info', duration: number = 3000) {
    Message.info({
      offset : [50,32],
      content,
      duration,
    });
  },

  // 获取预览内容（前50个字符）
  getPreviewContent(fullContent: string): string {
    if (!fullContent) return '';
    if (fullContent.length <= 50) return fullContent;
    return fullContent.substring(0, 50) + '...';
  },

  // 更新显示内容
  updateDisplayContent() {
    const fullContent = this.data.result.content;
    const displayContent =  this.getPreviewContent(fullContent);
    this.setData({ displayContent });
  },

  // 前端直接调用 Coze API 查询任务结果
  async queryTaskResultDirectly(executeId: string) {
    const queryUrl = `${COZE_CONFIG.BASE_URL}/v1/workflows/${COZE_CONFIG.WORKFLOW_ID}/run_histories/${executeId}`;
    
    try {
      const response = await new Promise<WechatMiniprogram.RequestSuccessCallbackResult>((resolve, reject) => {
        wx.request({
          url: queryUrl,
          method: 'GET',
          header: {
            'Authorization': `Bearer ${COZE_CONFIG.AUTH_TOKEN}`,
            'Content-Type': 'application/json'
          },
          success: resolve,
          fail: reject
        });
      });

      console.log('前端直接查询Coze API响应:', response);

      if (response.statusCode !== 200) {
        throw new Error(`HTTP ${response.statusCode}: ${response.data}`);
      }

      const result = response.data as any;
      if (result.code !== 0) {
        throw new Error(`API错误: ${result.msg}`);
      }

      return result.data;
    } catch (error: any) {
      console.error('前端调用Coze API失败:', error);
      throw error;
    }
  },

  // 解析 Coze API 返回的结果
  parseCozeResult(data: any): ExtractResult {
    console.log('开始解析Coze结果, 原始数据:', data);
    
    if (!data || data.length === 0) {
      throw new Error('没有找到执行结果');
    }

    const taskData = data[0];
    console.log('任务数据:', taskData);
    console.log('任务状态:', taskData.execute_status);
    
    if (taskData.execute_status !== 'Success') {
      throw new Error(`任务执行失败，状态: ${taskData.execute_status}`);
    }

    // 解析输出数据
    const outputStr = taskData.output;
    console.log('输出字符串:', outputStr);
    
    if (!outputStr) {
      throw new Error('输出数据为空');
    }
    
    const outputData = JSON.parse(outputStr);
    console.log('解析后的输出数据:', outputData);
    
    const resultStr = outputData.Output;
    console.log('结果字符串:', resultStr);
    
    if (!resultStr) {
      throw new Error('Output字段为空');
    }
    
    const result = JSON.parse(resultStr);
    console.log('最终解析结果:', result);

    return {
      content: result.content || '',
      photo: result.photo || '',
      title: result.title || '',
      url: result.url || ''
    };
  },

  // 验证视频链接格式
  validateVideoUrl(url: string): boolean {
    // 行级注释: 检查是否包含常见视频平台的链接特征
    const patterns = [
      /douyin\.com/i,
      /dy\.com/i,
      /v\.douyin\.com/i,
      /xiaohongshu\.com/i,
      /xhslink\.com/i,
      /bilibili\.com/i,
      /b23\.tv/i,
      /kuaishou\.com/i,
      /ks\.com/i
    ];
    
    return patterns.some(pattern => pattern.test(url)) || url.includes('http');
  },

  // 输入事件
  onInput(e: WechatMiniprogram.TextareaInput) {
    // 行级注释: 实时更新输入框内容
    this.setData({ videoUrl: e.detail.value });
  },

  // 粘贴按钮
  async onPaste() {
    // 行级注释: 从系统剪贴板读取文本
    try {
      const { data } = await wx.getClipboardData();
      this.setData({ videoUrl: data || '' });
    } catch (err) {
      wx.showToast({ title: '粘贴失败', icon: 'none' });
    }
  },

  // 解析按钮
  async onParse() {
    const url = (this.data.videoUrl || '').trim();
    if (!url) {
      this.showMessage('请输入视频链接', 'warning');
      return;
    }

    // 行级注释: 验证视频链接格式
    if (!this.validateVideoUrl(url)) {
      this.showMessage('请输入有效的视频链接', 'warning');
      return;
    }

    // 行级注释: 检查用户是否已登录
    const userInfo = app.getUserInfo();
    if (!userInfo) {
      this.showMessage('请稍候，正在初始化用户信息...', 'info');
      return;
    }

    // 行级注释: 开始解析，设置解析状态
    this.setData({ parsing: true });
    
    try {
      // 行级注释: 第一步：发送提取任务
      this.showMessage('正在发送提取任务...', 'info');
      const sendResult = await wx.cloud.callFunction({
        name: 'extractText',
        data: { 
          action: 'sendTask',
          input: url 
        }
      });

      const sendResponse = sendResult.result as any;
      if (!sendResponse || !sendResponse.success) {
        throw new Error(sendResponse?.error || '发送任务失败');
      }

      const executeId = sendResponse.data.executeId;
      
      // 行级注释: 第二步：开始轮询查询结果（前端直接调用）
      this.showMessage('任务已发送，正在解析视频内容...', 'info');
      const extractData = await this.pollTaskResultDirectly(executeId);
      
      // 行级注释: 获取成功后，调用云函数更新用户提取次数
      await this.updateUserExtractCount();
      
      // 行级注释: 更新页面数据并显示结果，重置解锁状态
      this.setData({
        parsing: false,
        showResult: true,
        isContentUnlocked: false, // 重置解锁状态
        result: {
          cover: extractData.photo || '/static/imgs/index_icon.png',
          title: extractData.title || '未获取到标题',
          content: extractData.content || '未获取到内容',
          url: extractData.url || url
        }
      }, () => {
        // 行级注释: 数据设置完成后，更新显示内容
        this.updateDisplayContent();
      });
      
      this.showMessage('文案提取成功！', 'success');
      
      // 行级注释: 清空输入框
      this.setData({ videoUrl: '' });
      
    } catch (error: any) {
      console.error('解析失败:', error);
      this.setData({ parsing: false });
      
      // 行级注释: 根据错误类型显示不同提示
      let errorMessage = '解析失败，请重试';
      if (error.message) {
        if (error.message.includes('网络')) {
          errorMessage = '网络连接异常，请检查网络后重试';
        } else if (error.message.includes('格式')) {
          errorMessage = '视频链接格式不正确';
        } else if (error.message.includes('超时')) {
          errorMessage = '解析超时，请稍后重试';
        } else {
          errorMessage = error.message;
        }
      }
      
      this.showMessage(errorMessage, 'error');
    }
  },

  // 轮询查询任务结果（前端直接调用Coze API）
  async pollTaskResultDirectly(executeId: string, maxAttempts: number = 30, interval: number = 5000): Promise<ExtractResult> {
    console.log('开始轮询查询任务结果（前端直接调用），执行ID:', executeId);
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        console.log(`第${i + 1}次查询，执行ID: ${executeId}`);
        
        // 行级注释: 前端直接调用 Coze API 查询任务状态
        const data = await this.queryTaskResultDirectly(executeId);
        
        console.log(`第${i + 1}次查询结果:`, data);

        if (!data || data.length === 0) {
          // 行级注释: 任务还在执行中，显示进度信息，每次增加5%
          const progress = Math.min((i + 1) * 5, 95);
          console.log(`任务执行中，进度: ${progress}%`);
          this.showMessage(`解析进度 ${progress}%，请耐心等待...`, 'info', 3000);
          
          // 行级注释: 等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, interval));
          continue;
        }

        const taskData = data[0];
        console.log('任务状态详情:', {
          execute_status: taskData.execute_status,
          create_time: taskData.create_time,
          update_time: taskData.update_time,
          hasOutput: !!taskData.output
        });
        
        if (taskData.execute_status === 'Success') {
          // 行级注释: 任务执行成功，解析并返回结果
          if (!taskData.output) {
            throw new Error('任务完成但未获取到结果数据');
          }
          
          const result = this.parseCozeResult(data);
          console.log('任务执行成功，解析结果:', result);
          return result;
        } 
        else if (taskData.execute_status === 'Failed') {
          console.error('任务执行失败');
          throw new Error(taskData.error_message || '任务执行失败');
        }
        else {
          // 行级注释: 任务还在执行中，显示进度信息，每次增加5%
          const progress = Math.min((i + 1) * 5, 95);
          console.log(`任务仍在执行中，状态: ${taskData.execute_status}，进度: ${progress}%`);
          this.showMessage(`解析进度 ${progress}%，请耐心等待...`, 'info', 3000);
          
          // 行级注释: 等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, interval));
          continue;
        }
        
      } catch (error: any) {
        console.error(`第${i + 1}次查询失败:`, error);
        console.error('错误详情:', error.message, error.stack);
        
        if (i === maxAttempts - 1) {
          throw error;
        }
        
        // 行级注释: 查询失败，等待后重试
        console.log('查询失败，等待后重试...');
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
    
    throw new Error('视频长度过大,解析超时');
  },

  // 调用云函数更新用户提取次数
  async updateUserExtractCount() {
    try {
      console.log('调用云函数更新用户提取次数');
      await wx.cloud.callFunction({
        name: 'extractText', 
        data: { 
          action: 'updateExtractCount'
        }
      });
      console.log('用户提取次数更新成功');
      
      // 行级注释: 同时更新本地全局数据
      const app = getApp();
      const currentStats = app.getUserStats();
      if (currentStats) {
        app.updateUserStats({
          extractCount: currentStats.extractCount + 1
        });
      }
    } catch (error) {
      console.error('更新用户提取次数失败:', error);
      // 行级注释: 这里不抛出错误，因为主要功能已完成
    }
  },

  onLoad() {
    // 行级注释: 加载自定义字体
    wx.loadFontFace({
      family: 'ZhanKuLogo',
      source: 'url("https://ark-auto-2101613510-cn-beijing-default.tos-cn-beijing.volces.com/logo_zhanku.otf")',
      global: true,
      success: console.log,
      fail: (res)=>{
        console.log(res)
      },
    });
    
    // 行级注释: 加载配置项并更新页面显示
    this.loadConfigSettings();
  },

    // 加载配置设置（Promise 等待模式）
  async loadConfigSettings() {
    const app = getApp();
    
    try {
      // 行级注释: 等待配置加载完成，不再有时序问题
      console.log('等待配置加载完成...');
      const config = await app.waitForConfigReady();
      console.log('index 页面配置已就绪:', config);
      
      // 行级注释: 使用配置项更新页面数据
      this.setData({
        homeFooterInfo1: config.homeFooterInfo1,
        homeFooterInfo2: config.homeFooterInfo2
      });
    } catch (error) {
      console.error('加载配置失败:', error);
      // 行级注释: 使用默认配置
      this.setData({
        homeFooterInfo1: '支持平台：抖音 小红书 B站 快手',
        homeFooterInfo2: '复制文案和下载视频需要观看激励视频广告'
      });
    }
  },

  // 观看激励视频解锁完整内容
  watchRewardedVideoToUnlock() {
    // 行级注释: 获取配置的广告ID
    const app = getApp();
    const config = app.getAppConfig();
    const adUnitId = config?.rewardedVideoAdId || 'adunit-xxx';
    
    // 行级注释: 创建激励视频广告实例
    const rewardedVideoAd = wx.createRewardedVideoAd({
      adUnitId: adUnitId
    });

    rewardedVideoAd.onLoad(() => {
      console.log('激励视频广告加载成功');
    });

    rewardedVideoAd.onError((err: any) => {
      console.error('激励视频广告加载失败:', err);
      this.showMessage('广告加载失败，请稍后重试', 'error');
    });

    rewardedVideoAd.onClose((res: any) => {
      if (res && res.isEnded) {
        // 行级注释: 用户完整观看了视频，解锁内容
        this.setData({ isContentUnlocked: true }, () => {
          this.updateDisplayContent();
        });
        this.showMessage('内容已解锁！现在可以复制完整文案了', 'success');
      } else {
        // 行级注释: 用户未完整观看视频
        this.showMessage('请完整观看视频才能解锁内容', 'warning');
      }
    });

    // 行级注释: 显示激励视频
    rewardedVideoAd.show().catch(() => {
      // 行级注释: 广告显示失败，直接解锁（开发阶段可以这样做）
      this.showMessage('广告暂不可用，为您免费解锁', 'info');
      this.setData({ isContentUnlocked: true }, () => {
        this.updateDisplayContent();
      });
    });
  },

  // 复制文案
  copyContent() {
    const fullContent = this.data.result.content || '';
    if (!fullContent) {
      this.showMessage('没有可复制的内容', 'warning');
      return;
    }

    // 行级注释: 检查是否已解锁
    if (!this.data.isContentUnlocked) {
      // 行级注释: 未解锁，提示观看视频
      wx.showModal({
        title: '解锁完整内容',
        content: '观看激励视频即可复制完整文案',
        confirmText: '观看视频',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.watchRewardedVideoToUnlock();
          }
        }
      });
      return;
    }
    
    // 行级注释: 已解锁，复制完整内容
    wx.setClipboardData({
      data: fullContent,
      success: () => {
        this.showMessage('完整文案已复制到剪贴板！', 'success');
      },
      fail: () => {
        this.showMessage('复制失败，请重试', 'error');
      }
    });
  },

  handleFabClick  () {
    // 行级注释：点击悬浮按钮跳转到个人资料页面
    wx.navigateTo({
      url: '/pages/profile/profile',
      success: () => {
        console.log('成功跳转到个人资料页面');
      },
      fail: (error) => {
        console.error('跳转失败:', error);
      }
    });
  },

  // 下载视频
  downloadVideo() {
    // 行级注释: 检查是否有视频URL
    const videoUrl = this.data.result.url;
    if (!videoUrl) {
      this.showMessage('没有可下载的视频', 'warning');
      return;
    }

    // 行级注释: 检查是否已解锁
    if (!this.data.isContentUnlocked) {
      // 行级注释: 未解锁，提示观看视频
      wx.showModal({
        title: '解锁视频下载',
        content: '观看激励视频即可获取视频下载链接',
        confirmText: '观看视频',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.watchRewardedVideoToUnlock();
          }
        }
      });
      return;
    }

    // 行级注释: 已解锁，提供下载功能
    wx.showModal({
      title: '下载视频',
      content: '是否要复制视频链接？您可以在浏览器中打开进行下载。',
      confirmText: '复制链接',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: videoUrl,
            success: () => {
              this.showMessage('视频链接已复制！', 'success');
            },
            fail: () => {
              this.showMessage('复制失败，请重试', 'error');
            }
          });
        }
      }
    });
  },

  // 关闭结果弹框
  closeResult() {
    this.setData({ 
      showResult: false,
      isContentUnlocked: false // 重置解锁状态
    });
  },

  // 点击遮罩关闭（处理t-popup的visible-change事件）
  onModalBackdrop(e: any) {
    // 行级注释: 当弹框关闭时触发
    if (!e.detail.visible) {
      this.setData({ 
        showResult: false,
        isContentUnlocked: false // 重置解锁状态
      });
    }
  },

  // 用户头像按钮点击
  handleClick() {
    // 行级注释: 显示用户信息或跳转到个人中心
    const userInfo = app.getUserInfo();
    if (userInfo) {
      wx.showModal({
        title: '用户信息',
        content: `提取次数: ${userInfo.extract_count}\n分享次数: ${userInfo.share_count}\n积分: ${userInfo.points}`,
        showCancel: true,
        cancelText: '关闭',
        confirmText: '分享小程序',
        success: (res) => {
          if (res.confirm) {
            this.shareApp();
          }
        }
      });
    } else {
      wx.showToast({ title: '正在初始化用户信息...', icon: 'none' });
    }
  },

  // 分享小程序
  async shareApp() {
    try {
      // 行级注释: 更新分享次数
      await app.updateShareCount();
      
      // 行级注释: 触发分享
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline']
      });
      
      wx.showToast({ title: '感谢分享！积分+10', icon: 'success' });
    } catch (error) {
      console.error('分享失败:', error);
      wx.showToast({ title: '分享失败', icon: 'none' });
    }
  },

  // 页面分享配置
  onShareAppMessage() {
    // 行级注释: 使用配置项
    const app = getApp();
    const config = app.getAppConfig();
    
    return {
      title: config?.shareTitle || '提取文案 - 一键获取视频文案',
      path: '/pages/index/index',
      imageUrl: config?.shareCover || '/static/imgs/index_icon.png'
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    // 行级注释: 使用配置项
    const app = getApp();
    const config = app.getAppConfig();
    
    return {
      title: config?.shareTitle || '提取文案 - 一键获取视频文案',
      imageUrl: config?.shareCover || '/static/imgs/index_icon.png'
    };
  },

  // 空函数用于阻止冒泡
  noop() {}
});

