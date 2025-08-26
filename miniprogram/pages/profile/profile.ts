import Message from 'tdesign-miniprogram/message/index';
const app = getApp();
// profile.ts

Page({
  data: {
    userInfo: {
      name: '普通用户',
      description: 'UID: dislffd01j3k2kdxpd3',
      avatar: '文'
    },
    stats: {
      extractCount: 0,
      points: 0,
      shareCount: 0
    },
    uid : '',
    appConfig : {
      sharePoint : 5
    },
    // 行级注释：配置项相关数据
    profileFooterInfo: '感谢您使用文案提取助手'
  },

  // 页面加载
  onLoad() {
    // 行级注释：加载用户统计数据
    this.loadUserStats();
    const openid = app.getUserInfo();
    this.setData({
      uid :openid.openid 
    })
    // 行级注释：加载配置项
    this.loadConfigSettings();
  },

  // 页面显示时刷新数据
  onShow() {
    // 行级注释：每次显示页面时刷新用户统计数据
    this.loadUserStats();
  },

  // 加载配置设置
  loadConfigSettings() {
    const app = getApp();
    const config = app.getAppConfig();
    
    if (config) {
      // 行级注释: 使用配置项更新页面数据
      this.setData({
        profileFooterInfo: config.profileFooterInfo
      });
    }
  },

  // 显示消息提示
  showMessage(content: string, _theme: 'info' | 'success' | 'warning' | 'error' = 'info', duration: number = 3000) {
    Message.info({
      content,
      duration,
    });
  },

  // 加载用户统计数据
  loadUserStats() {
    // 行级注释：从全局数据获取真实的用户统计数据
    const app = getApp();
    const userStats = app.getUserStats();
    const appConfig = app.getAppConfig();
    
    if (userStats) {
      this.setData({
        'stats.extractCount': userStats.extractCount,
        'stats.points': userStats.points,
        'stats.shareCount': userStats.shareCount,
        'appConfig.sharePoint': appConfig.inviteRewardPoints
      });
    } else {
      console.warn('未获取到用户统计数据，使用默认值');
      this.setData({
        'stats.extractCount': 0,
        'stats.points': 0,
        'stats.shareCount': 0
      });
    }
  },

  // 复制分享文案
  copyShareText() {
    const shareText = '超好用的视频文案提取工具，支持抖音、小红书、B站、快手！快来试试吧~';
    
    wx.setClipboardData({
      data: shareText,
      success: () => {
        this.showMessage('分享文案已复制到剪贴板！', 'success');
        this.updateShareCount();
      },
      fail: () => {
        this.showMessage('复制失败，请重试', 'error');
      }
    });
  },

  // 更新分享次数
  async updateShareCount() {
    const app = getApp();
    
    // 行级注释: 调用app.ts中的分享更新方法，获取配置的积分奖励
    const rewardPoints = await app.updateShareCount();
    
    if (rewardPoints > 0) {
      // 行级注释: 更新页面显示的数据
      const userStats = app.getUserStats();
      if (userStats) {
        this.setData({
          'stats.shareCount': userStats.shareCount,
          'stats.points': userStats.points
        });
      }
      
      // 行级注释: 显示获得积分的提示
      this.showMessage(`分享成功！获得${rewardPoints}积分`, 'success');
      console.log('分享次数已更新，获得积分:', rewardPoints);
    } else {
      // 行级注释: 分享失败或没有获得积分
      this.showMessage('分享失败，请重试', 'error');
    }
  },

  // 打赏作者
  onRewardAuthor() {
    console.log('点击打赏作者');
    
    // 行级注释：显示打赏信息
    wx.showModal({
      title: '感谢您的支持！',
      content: '您的支持是我继续开发的动力！\n\n如需打赏，请添加作者微信：yibu_ai',
      showCancel: true,
      cancelText: '取消',
      confirmText: '复制微信号',
      success: (res) => {
        if (res.confirm) {
          // 行级注释：复制微信号
          wx.setClipboardData({
            data: 'wenzhang_help',
            success: () => {
              this.showMessage('微信号已复制！', 'success');
            }
          });
        }
      }
    });
  },

  // 联系作者
  onContactAuthor() {
    console.log('点击联系作者');
    
    // 行级注释：显示联系方式
    wx.showModal({
      title: '联系作者',
      content: '💬 微信：yibu_ai \n📱 抖音：伊布讲 AI\n\n 添加时记得备注小程序！',
      showCancel: true,
      cancelText: '取消',
      confirmText: '复制邮箱',
      success: (res) => {
        if (res.confirm) {
          // 行级注释：复制邮箱地址
          wx.setClipboardData({
            data: '微信：yibu_ai',
            success: () => {
              this.showMessage('微信已复制！', 'success');
            }
          });
        }
      }
    });
  },

  // 页面分享配置
  onShareAppMessage() {
    // 行级注释：使用配置项
    const app = getApp();
    const config = app.getAppConfig();
    
    // 行级注释：用户触发分享时更新分享次数（异步执行，不阻塞分享）
    this.updateShareCount().catch(err => {
      console.error('更新分享次数失败:', err);
    });
    
    return {
      title: config?.shareTitle || '提取文案小程序',
      desc: '超好用的视频文案提取工具！',
      path: '/pages/index/index',
      imageUrl: config?.shareCover || '/static/imgs/share_logo.png'
    };
  },

  // 页面分享到朋友圈
  onShareTimeline() {
    // 行级注释：使用配置项
    const app = getApp();
    const config = app.getAppConfig();
    
    // 行级注释：用户触发分享到朋友圈时更新分享次数（异步执行，不阻塞分享）
    this.updateShareCount().catch(err => {
      console.error('更新分享次数失败:', err);
    });
    
    return {
      title: config?.shareTitle || '提取文案小程序 - 视频文案提取神器',
      query: 'from=timeline',
      imageUrl: config?.shareCover || '/static/imgs/index_icon.png'
    };
  }
});
