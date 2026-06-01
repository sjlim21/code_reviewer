#!/usr/bin/env node

/**
 * CODE EYE - Database Schema Auto Initialization Tool
 * Node.js script to run setup.sql on your remote Supabase instance
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import os from 'os';
import pg from 'pg';

const { Client } = pg;

// ESM __dirname setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const SQL_PATH = path.join(PROJECT_ROOT, 'setup.sql');
const CONFIG_PATH = path.join(os.homedir(), '.code-eye-config.json');

// Helper to ask interactive questions
const askQuestion = (query) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
};

// Parse .env file
const loadEnv = () => {
  const envVars = {};
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      const val = valueParts.join('=').trim();
      if (key) {
        envVars[key.trim()] = val.replace(/^["']|["']$/g, '');
      }
    }
  }
  return envVars;
};

// Load cached session config
const loadSessionConfig = () => {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) || {};
    } catch (e) {
      return {};
    }
  }
  return {};
};

const runSqlWithClient = async (connectionString, sqlContent) => {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('\x1b[34m[Database] Supabase PostgreSQL 데이터베이스에 연결하는 중...\x1b[0m');
    await client.connect();
    console.log('\x1b[32m- DB 연결 성공!\x1b[0m');
    
    console.log('\x1b[34m[Database] 테이블, RLS 정책, 트리거 및 시드 데이터를 주입하는 중...\x1b[0m');
    await client.query(sqlContent);
    console.log('\n\x1b[32m🎉 [Success] Supabase 데이터베이스 테이블 및 스키마 초기화가 완벽히 완료되었습니다!\x1b[0m');
    console.log('  - 생성 완료 테이블: profiles, projects, project_members, analysis_runs, issues, severity_rules 등');
    console.log('  - RLS 보안 정책 및 권한 트리거 등록 완료');
    console.log('  - Seed 기본 룰 데이터 적재 완료\n');
    await client.end();
    return true;
  } catch (err) {
    console.error('\n\x1b[31m[Error] 데이터베이스 작업에 실패했습니다.\x1b[0m');
    console.error(`상세 에러: ${err.message}`);
    
    if (err.message.includes('ENOTFOUND') || err.message.includes('EAI_AGAIN')) {
      console.log('\n\x1b[33m💡 [네트워크 도움말] Direct 연결 주소(db.xxxx.supabase.co)는 IPv6 전용입니다.\x1b[0m');
      console.log('사용하시는 인터넷이 IPv4 전용인 경우, Direct 주소 대신 풀러(aws-0-xxxx.pooler.supabase.com) 주소가 필요합니다.');
      console.log('Supabase 프로젝트 대시보드 -> Settings -> Database -> Connection Strings (Node.js/URI) 에서');
      console.log('풀러 연결 주소를 복사해 입력하시는 것을 권장합니다.');
    }
    
    try {
      await client.end();
    } catch (e) {}
    return false;
  }
};

const main = async () => {
  console.log('\n\x1b[36m========== CODE EYE: Supabase 데이터베이스 자동 구축 ==========\x1b[0m');
  
  if (!fs.existsSync(SQL_PATH)) {
    console.error(`\x1b[31m[Error] setup.sql 파일을 찾을 수 없습니다: ${SQL_PATH}\x1b[0m`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(SQL_PATH, 'utf8');

  // 1. .env 및 로컬 캐시 로딩
  const env = loadEnv();
  const sessionConfig = loadSessionConfig();

  // 2. DATABASE_URL이 .env에 있는지 검증
  const databaseUrl = process.env.DATABASE_URL || env.DATABASE_URL || '';
  if (databaseUrl) {
    console.log('\x1b[32m- .env 에서 DATABASE_URL을 발견하여 자동 연결을 시도합니다.\x1b[0m');
    const success = await runSqlWithClient(databaseUrl, sqlContent);
    if (success) process.exit(0);
  }

  // 3. 수동 연결 방식 선택
  console.log('\n연결 방식을 선택해 주세요:');
  console.log('  [1] Supabase Connection URI 직접 복사 붙여넣기 (권장: IPv4/IPv6 네트워크 모두 대응)');
  console.log('  [2] Project ID 와 비밀번호 입력으로 자동 연결 (IPv6 전용 Direct 연결)');
  
  const choice = await askQuestion('\n선택 (1 또는 2): ');

  if (choice === '1') {
    console.log('\n\x1b[33m[Connection Info] Supabase 대시보드(Settings -> Database)의 Connection URI를 복사해 입력하세요.\x1b[0m');
    console.log('형식 예: postgresql://postgres:[비밀번호]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require');
    const inputUri = await askQuestion('🔗 Connection URI: ');
    
    if (!inputUri) {
      console.error('\x1b[31m[Error] 연결 URI가 입력되지 않아 작업을 종료합니다.\x1b[0m');
      process.exit(1);
    }
    
    // 만약 사용자가 [YOUR-PASSWORD]를 치환하지 않고 넣었다면 경고
    if (inputUri.includes('[YOUR-PASSWORD]') || inputUri.includes('[YOUR-DB-PASSWORD]') || inputUri.includes('[비밀번호]')) {
      console.log('\n\x1b[33m[Warning] URI에 비밀번호 치환 문자가 감지되었습니다.\x1b[0m');
      const realPassword = await askQuestion('🔑 실제 DB 비밀번호 입력: ');
      const cleanUri = inputUri
        .replace('[YOUR-PASSWORD]', encodeURIComponent(realPassword))
        .replace('[YOUR-DB-PASSWORD]', encodeURIComponent(realPassword))
        .replace('[비밀번호]', encodeURIComponent(realPassword));
      const success = await runSqlWithClient(cleanUri, sqlContent);
      process.exit(success ? 0 : 1);
    } else {
      const success = await runSqlWithClient(inputUri, sqlContent);
      process.exit(success ? 0 : 1);
    }
  } else {
    // Project ID & Password 방식
    const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || sessionConfig.supabase_url || '';
    let projectRef = '';
    if (supabaseUrl) {
      try {
        const urlObj = new URL(supabaseUrl);
        projectRef = urlObj.hostname.split('.')[0];
      } catch (e) {}
    }

    if (!projectRef) {
      projectRef = await askQuestion('🔗 Supabase Project Reference ID 입력 (예: njhkfcliwjdkzygykarp): ');
    } else {
      console.log(`\x1b[32m- 프로젝트 ID 자동 감지 완료: ${projectRef}\x1b[0m`);
    }

    if (!projectRef) {
      console.error('\x1b[31m[Error] 프로젝트 ID가 입력되지 않아 작업을 종료합니다.\x1b[0m');
      process.exit(1);
    }

    console.log('\n\x1b[33m[Authentication] Supabase 데이터베이스 비밀번호를 입력해 주세요.\x1b[0m');
    const dbPassword = await askQuestion('🔑 DB Password: ');

    if (!dbPassword) {
      console.error('\x1b[31m[Error] 비밀번호가 입력되지 않았습니다.\x1b[0m');
      process.exit(1);
    }

    const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
    const success = await runSqlWithClient(connectionString, sqlContent);
    process.exit(success ? 0 : 1);
  }
};

main();
