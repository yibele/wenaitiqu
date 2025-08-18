// app.ts
App({
  globalData: {
    userInfo: null as UserInfo | null,
    openid: '',
    appConfig: null as AppConfig | null,
    userStats: null as UserStats | null,
  },

  // 行级注释：配置加载完成的 Promise 控制器
  _configReadyResolve: null as ((config: AppConfig) => void) | null,
  _configReadyPromise: null as Promise<AppConfig> | null,
  _isReady: false,

  onLaunch() {
    // 行级注释: 初始化配置加载 Promise
    this._configReadyPromise = new Promise<AppConfig>((resolve) => {
      this._configReadyResolve = resolve;
    });

    // 行级注释: 初始化云开发
    wx.cloud.init({
      // env: 'YOUR_CLOUD_ENV_ID', // 替换为您的云开发环境ID
      traceUser: true,
    });

    // 行级注释: 执行静默登录（同时获取配置）
    this.silentLogin();
  },

  // 静默登录方法
  async silentLogin() {
    try {
      
      // 行级注释: 调用云函数获取openid和配置信息
      const loginResult = await wx.cloud.callFunction({
        name: 'login'
      });

      const result = loginResult.result as any;
      if (result && result.openid) {
        const openid = result.openid;
        this.globalData.openid = openid;

        // 行级注释: 保存配置信息
        if (result.appConfig) {
          this.globalData.appConfig = result.appConfig;
          console.log('应用配置已加载:', result.appConfig);
          // 行级注释: 通知配置加载完成
          this._markConfigReady(result.appConfig);
        } else {
          console.warn('未获取到配置信息，使用默认配置');
          const defaultConfig = await this.loadDefaultConfig();
          // 行级注释: 通知默认配置加载完成
          this._markConfigReady(defaultConfig);
        }

        // 行级注释: 保存用户统计数据
        if (result.userStats) {
          this.globalData.userStats = result.userStats;
          console.log('用户统计数据已加载:', result.userStats);
        } else {
          console.warn('未获取到用户统计数据');
        }
      }

    } catch (error) {
      console.error('静默登录失败:', error);
      // 行级注释: 登录失败时也要加载默认配置
      const defaultConfig = await this.loadDefaultConfig();
      // 行级注释: 确保即使登录失败也通知配置就绪
      this._markConfigReady(defaultConfig);
      wx.showToast({
        title: ' 用户登录失败，请联系管理员',
        icon: 'none'
      });
    }
  },

  // 创建或更新用户记录
  async createOrUpdateUser(openid: string) {
    try {
      const db = wx.cloud.database();
      const usersCollection = db.collection('users');

      // 行级注释: 查询当前用户记录（云开发会自动基于_openid过滤）
      const userQuery = await usersCollection.limit(1).get();

      const now = new Date();

      if (userQuery.data.length === 0) {
        // 行级注释: 用户不存在，创建新用户记录（_openid会自动注入）
        const newUserData = {
          extract_count: 0,
          share_count: 0,
          points: 0,
          created_at: now,
          last_login_at: now
        };

        const addResult = await usersCollection.add({
          data: newUserData
        });

        // 行级注释: 保存用户信息到globalData
        this.globalData.userInfo = {
          _id: addResult._id as string,
          _openid: openid,
          ...newUserData
        };

        console.log('新用户创建成功:', addResult._id);
      } else {
        // 行级注释: 用户已存在，更新最后登录时间
        const existingUser = userQuery.data[0] as UserInfo;
        
        await usersCollection.doc(existingUser._id!).update({
          data: {
            last_login_at: now
          }
        });

        // 行级注释: 更新globalData中的用户信息
        this.globalData.userInfo = {
          ...existingUser,
          _openid: openid,
          last_login_at: now
        };

        console.log('用户登录时间已更新:', existingUser._id);
      }
    } catch (error) {
      console.error('创建或更新用户失败:', error);
      throw error;
    }
  },

  // 获取用户信息的便捷方法
  getUserInfo(): UserInfo | null {
    return this.globalData.userInfo;
  },

  // 更新用户提取次数
  async updateExtractCount() {
    const userInfo = this.globalData.userInfo;
    if (!userInfo || !userInfo._id) return;

    try {
      const db = wx.cloud.database();
      const usersCollection = db.collection('users');

      // 行级注释: 增加提取次数
      await usersCollection.doc(userInfo._id).update({
        data: {
          extract_count: db.command.inc(1)
        }
      });

      // 行级注释: 更新本地缓存
      if (this.globalData.userInfo) {
        this.globalData.userInfo.extract_count += 1;
      }
    } catch (error) {
      console.error('更新提取次数失败:', error);
    }
  },

  // 更新用户分享次数
  async updateShareCount() {
    const userInfo = this.globalData.userInfo;
    if (!userInfo || !userInfo._id) return;

    try {
      const db = wx.cloud.database();
      const usersCollection = db.collection('users');

      // 行级注释: 增加分享次数和积分
      await usersCollection.doc(userInfo._id).update({
        data: {
          share_count: db.command.inc(1),
          points: db.command.inc(10) // 分享获得10积分
        }
      });

      // 行级注释: 更新本地缓存
      if (this.globalData.userInfo) {
        this.globalData.userInfo.share_count += 1;
        this.globalData.userInfo.points += 10;
      }
    } catch (error) {
      console.error('更新分享次数失败:', error);
    }
  },

  // 加载默认配置
  async loadDefaultConfig(): Promise<AppConfig> {
    // 行级注释: 使用默认配置
    const defaultConfig: AppConfig = {
      rewardedVideoAdId: 'adunit-xxx',
      nativeTemplateAdId: 'adunit-yyy', 
      interstitialAdId: 'adunit-zzz',
      shareTitle: '提取文案 - 一键获取视频文案',
      shareCover: '/static/imgs/index_icon.png',
      homeNotice: '有问题请联系作者',
      initialPoints: 100,
      inviteRewardPoints: 50,
      checkinPoints: 10,
      adWatchInterval: 300,
      homeFooterInfo1: '支持平台：抖音 小红书 B站 快手',
      homeFooterInfo2: '复制文案和下载视频需要观看激励视频广告',
      profileFooterInfo: '感谢您使用文案提取助手',
      version: '1.0.0',
      updateTime: new Date(),
      subscriptionTemplateIds : ['123123123'],
    };
    
    this.globalData.appConfig = defaultConfig;
    console.log('使用默认配置');
    return defaultConfig;
  },

  // 获取应用配置的便捷方法
  getAppConfig(): AppConfig | null {
    return this.globalData.appConfig;
  },

  // 获取用户统计数据的便捷方法
  getUserStats(): UserStats | null {
    return this.globalData.userStats;
  },

  // 更新用户统计数据（本地）
  updateUserStats(newStats: Partial<UserStats>): void {
    if (this.globalData.userStats) {
      this.globalData.userStats = {
        ...this.globalData.userStats,
        ...newStats
      };
      console.log('本地用户统计数据已更新:', this.globalData.userStats);
    }
  },

  // 标记配置已就绪
  _markConfigReady(config: AppConfig): void {
    this._isReady = true;
    if (this._configReadyResolve) {
      this._configReadyResolve(config);
      this._configReadyResolve = null; // 防止重复调用
    }
  },

  // 等待配置加载完成
  async waitForConfigReady(): Promise<AppConfig> {
    if (this._isReady && this.globalData.appConfig) {
      return this.globalData.appConfig;
    }
    return this._configReadyPromise!;
  },

  // 检查是否已就绪
  isReady(): boolean {
    return this._isReady;
  }
})