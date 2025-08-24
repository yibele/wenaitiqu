// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()

  try {
    // 行级注释：获取应用配置
    let appConfig = null;
    try {
      const configResult = await db.collection('app_config').doc('global').get();
      if (configResult.data) {
        appConfig = configResult.data;
        console.log('配置获取成功');
      }
    } catch (configError) {
      console.error('获取配置失败:', configError);
      // 行级注释：如果获取配置失败，返回默认配置
      appConfig = {
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
        updateTime: new Date()
      };
    }

    // 行级注释：获取用户数据和用户信息
    let userStats = null;
    let userInfo = null;
    try {
      const userQuery = await db.collection('users').limit(1).get();
      if (userQuery.data.length > 0) {
        const userData = userQuery.data[0];
        
        // 行级注释：更新最后登录时间
        const now = new Date();
        await db.collection('users').doc(userData._id).update({
          data: {
            last_login_at: now
          }
        });
        
        // 行级注释：构建用户统计数据（用于兼容）
        userStats = {
          extractCount: userData.extract_count || 0,
          shareCount: userData.share_count || 0,
          points: userData.points || 0,
          createdAt: userData.created_at,
          lastLoginAt: now
        };
        
        // 行级注释：构建完整用户信息
        userInfo = {
          _id: userData._id,
          extract_count: userData.extract_count || 0,
          share_count: userData.share_count || 0,
          points: userData.points || 0,
          created_at: userData.created_at,
          last_login_at: now
        };
        
        console.log('用户数据获取成功:', userStats);
      } else {
        // 行级注释：新用户，创建用户记录
        const now = new Date();
        const newUserData = {
          extract_count: 0,
          share_count: 0,
          points: appConfig ? appConfig.initialPoints : 5, // 使用配置的初始积分
          created_at: now,
          last_login_at: now
        };
        
        const addResult = await db.collection('users').add({
          data: newUserData
        });
        
        // 行级注释：构建用户统计数据（用于兼容）
        userStats = {
          extractCount: newUserData.extract_count,
          shareCount: newUserData.share_count,
          points: newUserData.points,
          createdAt: newUserData.created_at,
          lastLoginAt: newUserData.last_login_at
        };
        
        // 行级注释：构建完整用户信息
        userInfo = {
          _id: addResult._id,
          extract_count: newUserData.extract_count,
          share_count: newUserData.share_count,
          points: newUserData.points,
          created_at: newUserData.created_at,
          last_login_at: newUserData.last_login_at
        };
        
        console.log('新用户创建成功:', addResult._id);
      }
    } catch (userError) {
      console.error('获取用户数据失败:', userError);
      // 行级注释：用户数据获取失败时使用默认值
      const now = new Date();
      userStats = {
        extractCount: 0,
        shareCount: 0,
        points: appConfig ? appConfig.initialPoints : 5,
        createdAt: now,
        lastLoginAt: now
      };
      userInfo = {
        _id: null,
        extract_count: 0,
        share_count: 0,
        points: appConfig ? appConfig.initialPoints : 5,
        created_at: now,
        last_login_at: now
      };
    }

    // 行级注释：返回用户信息、配置信息和用户数据
    return {
      openid: wxContext.OPENID,
      appid: wxContext.APPID,
      unionid: wxContext.UNIONID,
      appConfig: appConfig,
      userStats: userStats,
      userInfo: userInfo
    }
  } catch (error) {
    console.error('login云函数执行失败:', error);
    const now = new Date();
    return {
      openid: wxContext.OPENID,
      appid: wxContext.APPID,
      unionid: wxContext.UNIONID,
      appConfig: null,
      userStats: {
        extractCount: 0,
        shareCount: 0,
        points: 100,
        createdAt: now,
        lastLoginAt: now
      },
      userInfo: {
        _id: null,
        extract_count: 0,
        share_count: 0,
        points: 100,
        created_at: now,
        last_login_at: now
      },
      error: error.message
    }
  }
}
