#!/usr/bin/env python3
"""
飞书日历创建脚本
用法: python3 feishu_calendar.py "summary" "start_time" "end_time" [description]
时间格式: RFC3339, 如 2024-03-16T20:00:00+08:00
"""

import requests
import json
import sys
import os

# 飞书配置
APP_ID = os.environ.get("FEISHU_APP_ID")
APP_SECRET = os.environ.get("FEISHU_APP_SECRET")
CALENDAR_ID = os.environ.get("FEISHU_CALENDAR_ID")

def get_tenant_access_token():
    """获取 tenant_access_token"""
    url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
    data = {
        "app_id": APP_ID,
        "app_secret": APP_SECRET
    }
    response = requests.post(url, json=data)
    result = response.json()
    
    if result.get("code") != 0:
        raise Exception(f"获取 token 失败: {result}")
    
    return result["tenant_access_token"]

def create_calendar_event(token, summary, start_time, end_time, description=""):
    """创建日历事件"""
    url = f"https://open.feishu.cn/open-apis/calendar/v4/calendars/{CALENDAR_ID}/events"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # 转换 RFC3339 时间为时间戳
    from datetime import datetime, timezone
    start_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
    end_dt = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
    
    data = {
        "summary": summary,
        "description": description,
        "start": {
            "timestamp": str(int(start_dt.timestamp())),
            "timezone": "Asia/Shanghai"
        },
        "end": {
            "timestamp": str(int(end_dt.timestamp())),
            "timezone": "Asia/Shanghai"
        }
    }
    
    print(f"请求数据: {json.dumps(data, indent=2)}")
    response = requests.post(url, headers=headers, json=data)
    result = response.json()
    
    return result

def main():
    if len(sys.argv) < 4:
        print("用法: python3 feishu_calendar.py 'summary' 'start_time' 'end_time' [description]")
        print("时间格式: RFC3339, 如 2024-03-16T20:00:00+08:00")
        sys.exit(1)
    
    summary = sys.argv[1]
    start_time = sys.argv[2]
    end_time = sys.argv[3]
    description = sys.argv[4] if len(sys.argv) > 4 else ""
    
    print(f"📅 创建日程: {summary}")
    print(f"🕐 时间: {start_time} - {end_time}")
    
    token = get_tenant_access_token()
    result = create_calendar_event(token, summary, start_time, end_time, description)
    
    if result.get("code") == 0:
        print(f"✅ 日程创建成功! Event ID: {result['data']['event']['event_id']}")
        print(f"🔗 日程链接: {result['data']['event']['html_link']}")
    else:
        print(f"❌ 创建失败: {result}")
        sys.exit(1)

if __name__ == "__main__":
    main()
