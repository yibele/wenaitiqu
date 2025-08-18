/// <reference path="./types/index.d.ts" />

// 用户信息接口定义
interface UserInfo {
  _id?: string;
  _openid: string;
  extract_count: number;
  share_count: number;
  points: number;
  created_at: Date;
  last_login_at: Date;
}

// 应用配置接口定义
interface AppConfig {
  // 广告配置
  rewardedVideoAdId: string; // 激励广告id
  nativeTemplateAdId: string; // 原生模板广告id
  interstitialAdId: string; // 插屏广告id
  
  // 分享配置
  shareTitle: string; // 首页分享标题
  shareCover: string; // 首页分享封面图片
  
  // 公告配置
  homeNotice: string; // 首页公告
  
  // 积分配置
  initialPoints: number; // 初始积分
  inviteRewardPoints: number; // 邀请获得积分
  checkinPoints: number; // 签到积分
  
  // 广告频率配置（秒）
  adWatchInterval: number; // 多久看一次广告
  
  // 页面底部信息
  homeFooterInfo1: string; // 首页 footerinfo
  homeFooterInfo2: string; // 首页 footerinfo2
  profileFooterInfo: string; // profile footerinfo
  
  // 订阅消息配置
  subscriptionTemplateIds: Array<string>,

  
  // 其他配置
  version: string;
  updateTime: Date;

}

// 用户统计数据接口定义
interface UserStats {
  extractCount: number; // 提取次数
  shareCount: number;   // 分享次数
  points: number;       // 积分
  createdAt: Date;      // 创建时间
  lastLoginAt: Date;    // 最后登录时间
}

// 任务状态枚举
type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'timeout' | 'cancelled';

// 任务数据接口定义
interface TaskData {
  _id: string;
  _openid: string;
  task_uuid: string;
  status: TaskStatus;
  coze_execute_id: string;
  input_url: string;
  result: {
    title: string;
    content: string;
    cover: string;
    video_url: string;
  } | null;
  error_message: string | null;
  progress: number;
  retry_count: number;
  webhook_received: boolean;
  notification_sent: boolean;
  created_at: Date;
  updated_at: Date;
  started_at?: Date;
  completed_at?: Date;
  expires_at: Date;
}

interface IAppOption {
  globalData: {
    userInfo: UserInfo | null,
    openid: string,
    appConfig: AppConfig | null,
    userStats: UserStats | null,
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback,
  silentLogin(): Promise<void>;
  createOrUpdateUser(openid: string): Promise<void>;
  getUserInfo(): UserInfo | null;
  updateExtractCount(): Promise<void>;
  updateShareCount(): Promise<void>;
  loadDefaultConfig(): Promise<AppConfig>;
  getAppConfig(): AppConfig | null;
  getUserStats(): UserStats | null;
  updateUserStats(newStats: Partial<UserStats>): void;
  // 新增：等待配置加载完成的方法
  waitForConfigReady(): Promise<AppConfig>;
  // 新增：检查是否已就绪
  isReady(): boolean;
}