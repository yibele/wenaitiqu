import Message from 'tdesign-miniprogram/message/index';
// index.ts
const app = getApp();

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
    displayContent: '' // 当前显示的内容（预览或完整）
  },

  // 显示消息提示
  showMessage(content: string, _theme: 'info' | 'success' | 'warning' | 'error' = 'info', duration: number = 3000) {
    Message.info({
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
    const displayContent = this.data.isContentUnlocked ? fullContent : this.getPreviewContent(fullContent);
    this.setData({ displayContent });
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
      
      // 行级注释: 第二步：开始轮询查询结果
      this.showMessage('任务已发送，正在解析视频内容...', 'info');
      const extractData = await this.pollTaskResult(executeId);
      
      // 行级注释: 更新用户提取次数
      await app.updateExtractCount();
      
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

  // 轮询查询任务结果
  async pollTaskResult(executeId: string, maxAttempts: number = 30, interval: number = 5000): Promise<ExtractResult> {
    console.log('开始轮询查询任务结果，执行ID:', executeId);
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        console.log(`第${i + 1}次查询，执行ID: ${executeId}`);
        
        // 行级注释: 调用云函数查询任务状态
        const queryResult = await wx.cloud.callFunction({
          name: 'extractText',
          data: { 
            action: 'queryTask',
            executeId: executeId 
          }
        });

        console.log('云函数调用结果:', queryResult);

        if (!queryResult.result) {
          console.error('云函数返回结果为空');
          throw new Error('查询任务失败：云函数返回空结果');
        }

        const response = queryResult.result as any;
        console.log(`第${i + 1}次查询响应:`, response);
        
        if (response.success && response.status === 'success') {
          // 行级注释: 任务执行成功，返回结果
          console.log('任务执行成功，获取到结果:', response.data);
          return response.data as ExtractResult;
        } 
        else if (response.status === 'failed') {
          console.error('任务执行失败:', response.error);
          throw new Error(response.error || '任务执行失败');
        }
        else if (response.status === 'running') {
          // 行级注释: 任务还在执行中，显示进度信息，每次增加5%
          const progress = Math.min((i + 1) * 5, 95);
          console.log(`任务执行中，进度: ${progress}%`);
          this.showMessage(`解析进度 ${progress}%，请耐心等待...`, 'info', 3000);
          
          // 行级注释: 等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, interval));
          continue;
        }
        else if (!response.success) {
          // 行级注释: 查询未成功，可能是网络问题或API错误
          console.warn(`第${i + 1}次查询未成功:`, response);
          if (i < maxAttempts - 1) {
            console.log('等待后重试...');
            await new Promise(resolve => setTimeout(resolve, interval));
            continue;
          } else {
            throw new Error(response.error || '查询失败');
          }
        }
        else {
          // 行级注释: 其他状态，继续等待
          console.log(`未知状态，继续等待: ${JSON.stringify(response)}`);
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

  // 观看激励视频解锁完整内容
  watchRewardedVideoToUnlock() {
    // 行级注释: 创建激励视频广告实例
    const rewardedVideoAd = wx.createRewardedVideoAd({
      adUnitId: 'adunit-xxx' // 请替换为你的广告位ID
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
    return {
      title: '提取文案 - 一键获取视频文案',
      path: '/pages/index/index',
      imageUrl: '/static/imgs/index_icon.png'
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '提取文案 - 一键获取视频文案',
      imageUrl: '/static/imgs/index_icon.png'
    };
  },

  // 空函数用于阻止冒泡
  noop() {}
});

