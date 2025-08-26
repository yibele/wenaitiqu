import Message from 'tdesign-miniprogram/message/index';
// index.ts
const app = getApp();

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
    homeFooterInfo1: '支持平台：抖音 小红书 B站 快手',
    homeFooterInfo2: '一键获取视频文案，完全免费使用',
    watcher: null as any, // 用于保存数据库监听实例
    hasAds: false, // 是否配置了广告
  },

  // 显示消息提示
  showMessage(content: string, _theme: 'info' | 'success' | 'warning' | 'error' = 'info', duration: number = 3000) {
    Message.info({
      offset: [50, 32],
      content,
      duration,
    });
  },

  // 获取预览内容（前100个字符）
  getPreviewContent(fullContent: string): string {
    if (!fullContent) return '';
    if (fullContent.length <= 100) return fullContent;
    return fullContent.substring(0, 100) + '...';
  },

  // 更新显示内容
  updateDisplayContent() {
    const fullContent = this.data.result.content;
    // 行级注释: 界面永远只显示前100个字符预览，避免长文案撑坏UI
    const displayContent = this.getPreviewContent(fullContent);
    this.setData({ displayContent });
  },

  // 验证视频链接格式
  validateVideoUrl(url: string): boolean {
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
    this.setData({ videoUrl: e.detail.value });
  },

  // 粘贴按钮
  async onPaste() {
    try {
      const { data } = await wx.getClipboardData();
      this.setData({ videoUrl: data || '' });
    } catch (err) {
      wx.showToast({ title: '粘贴失败', icon: 'none' });
    }
  },


  // 解析按钮 - 新版 Watch 逻辑
  async onParse() {
    const url = (this.data.videoUrl || '').trim();
    if (!url) {
      this.showMessage('请输入视频链接', 'warning');
      return;
    }

    if (!this.validateVideoUrl(url)) {
      this.showMessage('请输入有效的视频链接', 'warning');
      return;
    }

    const userInfo = app.getUserInfo();
    console.log('用户数据', userInfo)
    if (!userInfo) {
      this.showMessage('请稍候，正在初始化用户信息...', 'info');
      return;
    }

    // 1. 请求订阅消息权限
    try {
      const appConfig = app.getAppConfig();
      const tmplIds = appConfig?.subscriptionTemplateIds || []; // 从全局配置获取模板ID数组
      if (tmplIds && tmplIds.length > 0) {
        await wx.requestSubscribeMessage({ tmplIds: tmplIds });
      }
    } catch (err) {
      console.warn('请求订阅消息权限失败:', err);
      // 行级注释: 订阅消息权限失败不影响主流程，继续执行
    }

    this.setData({ parsing: true });

    try {
      // 2. 调用云函数创建任务
      this.showMessage('任务已提交，正在解析...', 'info');
      const res = await wx.cloud.callFunction({
        name: 'startJob',
        data: {
          type: 'get_video_content', // 任务类型
          params: {
            url: url // 视频链接参数
          }
        }
      });
      
      // 3. 设置数据库监听
      const result = res.result as any;
      if (result && result.success) {
        this.setupDatabaseWatch(result.jobId);
      } else {
        throw new Error('任务创建失败');
      }

    } catch (error: any) {
      console.error('创建任务失败:', error);
      this.setData({ parsing: false });
      this.showMessage(error.message || '创建任务失败，请重试', 'error');
    }
  },

  // 设置数据库监听
  setupDatabaseWatch(taskId: string) {
    console.log('设置数据库监听', taskId);
    const db = wx.cloud.database();
    const watcher = db.collection('coze_jobs').doc(taskId).watch({
      onChange: (snapshot) => {
        if (snapshot.docs.length > 0) {
          const job = snapshot.docs[0];
          if (job.status === 'success' || job.status === 'failed') {
            this.closeWatch(); // 收到最终状态后关闭监听
            this.setData({ parsing: false });

            if (job.status === 'success') {
              // 任务成功
              this.updateUserExtractCount();
              
              // 行级注释: 根据广告配置决定是否直接解锁内容
              this.setData({
                showResult: true,
                isContentUnlocked: !this.data.hasAds, // 没有广告配置时直接解锁
                result: {
                  cover: job.result.photo || '/static/imgs/index_icon.png',
                  title: job.result.title || '未获取到标题',
                  content: job.result.content || '未获取到内容',
                  url: job.result.url || ''
                }
              }, () => {
                this.updateDisplayContent();
              });
              this.showMessage('文案提取成功！', 'success');
              this.setData({ videoUrl: '' });
            } else {
              // 任务失败
              this.showMessage('解析失败，请稍后重试');
            }
          }
        }
      },
      onError: (err) => {
        console.error('数据库监听失败:', err);
        this.setData({ parsing: false });
        this.showMessage('网络异常，监听任务失败', 'error');
        this.closeWatch();
      }
    });

    this.setData({ watcher });
  },

  // 关闭数据库监听
  closeWatch() {
    if (this.data.watcher) {
      this.data.watcher.close();
      this.setData({ watcher: null });
      console.log('数据库监听已关闭');
    }
  },

  // 调用云函数更新用户提取次数
  async updateUserExtractCount() {
    try {
      await app.updateExtractCount();
    } catch (error) {
      console.error('更新用户提取次数失败:', error);
    }
  },

  async onLoad() {
    wx.loadFontFace({
      family: 'ZhanKuLogo',
      source: 'url("https://ark-auto-2101613510-cn-beijing-default.tos-cn-beijing.volces.com/logo_zhanku.otf")',
      global: true
    });
    await app.waitForLoginReady(); // 等待 app.ts 完成 createOrUpdateUser，确保 userInfo 就绪
    this.loadConfigSettings();
  },

  onUnload() {
    // 页面卸载时确保关闭监听
    this.closeWatch();
  },

  // 加载配置设置
  async loadConfigSettings() {
    try {
      const config = await app.waitForConfigReady();
      // 行级注释: 正确判断是否有广告配置
      const hasAds = config && config.rewardedVideoAdId && config.rewardedVideoAdId !== 'null';
      
      this.setData({
        homeFooterInfo1: config.homeFooterInfo1 || '支持平台：抖音 小红书 B站 快手',
        homeFooterInfo2: hasAds 
          ? (config.homeFooterInfo2 || '复制文案和下载视频需要观看激励视频广告')
          : '一键获取视频文案，完全免费使用',
        hasAds: hasAds
      });
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  },

  // ... 其他方法（watchRewardedVideoToUnlock, copyContent, downloadVideo等）保持不变 ...
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

    // 行级注释: 检查是否有广告配置
    if (!this.data.hasAds) {
      // 行级注释: 没有广告，直接复制完整内容
      wx.setClipboardData({
        data: fullContent,
        success: () => {
          this.showMessage('完整文案已复制到剪贴板！', 'success');
        },
        fail: () => {
          this.showMessage('复制失败，请重试', 'error');
        }
      });
      return;
    }

    // 行级注释: 有广告配置，检查是否已解锁
    if (!this.data.isContentUnlocked) {
      // 行级注释: 未解锁，直接播放广告
      this.watchRewardedVideoToUnlock();
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

    // 行级注释: 检查是否有广告配置
    if (!this.data.hasAds) {
      // 行级注释: 没有广告，直接下载
      this.performVideoDownload(videoUrl);
      return;
    }

    // 行级注释: 有广告配置，检查是否已解锁
    if (!this.data.isContentUnlocked) {
      // 行级注释: 未解锁，直接播放广告
      this.watchRewardedVideoToUnlock();
      return;
    }

    // 行级注释: 已解锁，进行下载
    this.performVideoDownload(videoUrl);
  },

    // 执行视频下载
  async performVideoDownload(videoUrl: string) {
    try {
      console.log('准备下载视频，URL:', videoUrl);
      await this.downloadToAlbum(videoUrl);
      
    } catch (error) {
      console.error('下载视频失败:', error);
      this.showMessage('下载失败，请重试', 'error');
    }
  },

  // 检查是否是有效的视频URL
  isValidVideoUrl(url: string): boolean {
    if (!url) return false;
    
    // 行级注释: 检查文件扩展名
    const videoExtensions = ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.webm', '.m4v'];
    const hasVideoExtension = videoExtensions.some(ext => url.toLowerCase().includes(ext));
    
    // 行级注释: 检查是否包含视频相关的URL特征
    const videoIndicators = ['video', 'media', 'stream'];
    const hasVideoIndicator = videoIndicators.some(indicator => url.toLowerCase().includes(indicator));
    
    // 行级注释: 排除明显的非视频文件
    const nonVideoExtensions = ['.json', '.txt', '.html', '.xml', '.js'];
    const hasNonVideoExtension = nonVideoExtensions.some(ext => url.toLowerCase().includes(ext));
    
    console.log('URL 检查结果:', {
      url,
      hasVideoExtension,
      hasVideoIndicator,
      hasNonVideoExtension
    });
    
    return (hasVideoExtension || hasVideoIndicator) && !hasNonVideoExtension;
  },

  // 下载视频到相册
  async downloadToAlbum(videoUrl: string) {
    let downloadTask: any = null;
    
    try {
      // 行级注释: 检查并申请写入相册权限
      const authResult = await this.requestSaveToPhotosAlbumAuth();
      if (!authResult) {
        this.showMessage('需要相册权限才能保存视频', 'warning');
        return;
      }

      // 行级注释: 显示统一的进度条，初始状态
      wx.showLoading({
        title: '正在准备下载视频...',
        mask: true
      });

      // 行级注释: 创建下载任务，带进度监听
      downloadTask = wx.downloadFile({
        url: videoUrl,
        success: async (res) => {
          try {
            if (res.statusCode === 200) {
              // 行级注释: 检查临时文件是否存在
              try {
                const fileManager = wx.getFileSystemManager();
                const stats = fileManager.statSync(res.tempFilePath);
                
                if (stats.size === 0) {
                  throw new Error('下载的文件为空');
                }
              } catch (statError) {
                console.error('文件检查失败:', statError);
                throw new Error('下载的文件无效，请重试');
              }

              // 行级注释: 保存视频到相册
              await wx.saveVideoToPhotosAlbum({
                filePath: res.tempFilePath
              });

              wx.hideLoading();
              this.showMessage('视频已保存到相册！', 'success');
            } else {
              throw new Error(`下载失败，状态码: ${res.statusCode}`);
            }
          } catch (saveError: any) {
            wx.hideLoading();
            console.error('保存视频失败:', saveError);
            
            if (saveError.errMsg && saveError.errMsg.includes('auth')) {
              // 行级注释: 权限问题，提供复制链接作为备选方案
              wx.showModal({
                title: '权限不足',
                content: '无法直接保存视频，是否复制视频链接？',
                confirmText: '复制链接',
                cancelText: '取消',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.setClipboardData({
                      data: videoUrl,
                      success: () => {
                        this.showMessage('视频链接已复制！', 'success');
                      }
                    });
                  }
                }
              });
            } else {
              this.showMessage('保存失败：' + (saveError.errMsg || saveError.message || '未知错误'), 'error');
            }
          }
        },
        fail: (error) => {
          console.error('下载视频失败:', error);
          wx.hideLoading();
          
          // 行级注释: 分析错误类型并给出相应提示
          let errorMessage = '下载失败';
          if (error.errMsg) {
            if (error.errMsg.includes('ENOENT') || error.errMsg.includes('no such file')) {
              errorMessage = '视频链接无效或已过期';
            } else if (error.errMsg.includes('network')) {
              errorMessage = '网络连接失败，请检查网络';
            } else if (error.errMsg.includes('timeout')) {
              errorMessage = '下载超时，请重试';
            } else {
              errorMessage = `下载失败：${error.errMsg}`;
            }
          }
          
          wx.showModal({
            title: '下载失败',
            content: `${errorMessage}\n\n是否复制视频链接？您可以在浏览器中打开进行下载。`,
            confirmText: '复制链接',
            cancelText: '取消',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.setClipboardData({
                  data: videoUrl,
                  success: () => {
                    this.showMessage('链接已复制！请在浏览器中打开下载', 'success');
                  },
                  fail: () => {
                    this.showMessage('复制失败，请重试', 'error');
                  }
                });
              }
            }
          });
        }
      });

      // 行级注释: 监听下载进度
      downloadTask.onProgressUpdate((progress: any) => {
        const percent = Math.round(progress.progress);
        const downloaded = Math.round(progress.totalBytesWritten / 1024); // KB
        const total = Math.round(progress.totalBytesExpectedToWrite / 1024); // KB
        // 行级注释: 统一在一个loading中显示进度
        wx.showLoading({
          title: `下载中 ${percent}%\n${downloaded}KB/${total}KB`,
          mask: true
        });
      });

    } catch (error: any) {
      wx.hideLoading();
      console.error('下载视频到相册失败:', error);
      this.showMessage('下载失败：' + (error.message || error.errMsg || '未知错误'), 'error');
    }
  },

  // 申请相册写入权限
  async requestSaveToPhotosAlbumAuth(): Promise<boolean> {
    try {
      // 行级注释: 检查当前权限状态
      const authSetting = await wx.getSetting();
      
      if (authSetting.authSetting['scope.writePhotosAlbum'] === false) {
        // 行级注释: 用户之前拒绝过，需要引导到设置页面
        const res = await wx.showModal({
          title: '需要相册权限',
          content: '需要获取您的相册权限，请在设置中开启',
          confirmText: '去设置',
          cancelText: '取消'
        });

        if (res.confirm) {
          await wx.openSetting();
          // 行级注释: 重新检查权限
          const newAuthSetting = await wx.getSetting();
          return newAuthSetting.authSetting['scope.writePhotosAlbum'] === true;
        }
        return false;
      } else if (authSetting.authSetting['scope.writePhotosAlbum'] === undefined) {
        // 行级注释: 还没有申请过权限，主动申请
        try {
          await wx.authorize({
            scope: 'scope.writePhotosAlbum'
          });
          return true;
        } catch (error) {
          // 行级注释: 用户拒绝了权限申请
          return false;
        }
      } else {
        // 行级注释: 已经有权限
        return true;
      }
    } catch (error) {
      console.error('获取权限状态失败:', error);
      return false;
    }
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

