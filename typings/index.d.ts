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

interface IAppOption {
  globalData: {
    userInfo: UserInfo | null,
    openid: string,
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback,
  silentLogin(): Promise<void>;
  createOrUpdateUser(openid: string): Promise<void>;
  getUserInfo(): UserInfo | null;
  updateExtractCount(): Promise<void>;
  updateShareCount(): Promise<void>;
}