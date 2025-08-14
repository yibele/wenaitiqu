// app.ts
App({
  globalData: {
    userInfo: null as UserInfo | null,
    openid: '',
  },

  onLaunch() {
    // 行级注释: 加载自定义字体
    wx.loadFontFace({
      family: 'ZhanKuLogo',
      source: 'url("/static/fonts/logo_zhanku.otf")',
      global: true,
      success: console.log,
      fail: console.error,
    });

    // 行级注释: 初始化云开发
    wx.cloud.init({
      // env: 'YOUR_CLOUD_ENV_ID', // 替换为您的云开发环境ID
      traceUser: true,
    });

    // 行级注释: 执行静默登录
    this.silentLogin();
  },

  // 静默登录方法
  async silentLogin() {
    try {
      
      // 行级注释: 调用云函数获取openid
      const loginResult = await wx.cloud.callFunction({
        name: 'login'
      });

      if (loginResult.result && (loginResult.result as any).openid) {
        const openid = (loginResult.result as any).openid;
        this.globalData.openid = openid;

        // 行级注释: 查询或创建用户记录
        await this.createOrUpdateUser(openid);
      }

    } catch (error) {
      console.error('静默登录失败:', error);
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
  }
})