# 🚚 Moving Backend

무빙(Moving) 서비스의 백엔드 서버입니다.

현재 프로젝트 초기 환경 구성을 완료한 상태이며, 이후 인증, 견적, 리뷰, 알림 등의 기능을 순차적으로 개발할 예정입니다.

---

# 🛠 Tech Stack

- Node.js
- Express
- TypeScript
- PostgreSQL
- Prisma ORM
- Morgan
- Winston
- ESLint
- Prettier

---

# 📂 Project Structure

```text
src
├── config
├── constants
├── lib
├── middlewares
├── modules
├── types
├── utils
├── app.ts
└── server.ts

prisma
└── schema.prisma
```

---

# ⚙️ Getting Started

### 1. Install

```bash
npm install
```

### 2. Environment Variables

`.env`

```env
PORT=5000
DATABASE_URL=

LOG_LEVEL=info

JWT_SECRET=
REFRESH_SECRET=
```

### 3. Prisma

```bash
npx prisma generate
npx prisma migrate dev
```

### 4. Run

```bash
npm run dev
```

---

# 📋 Current Features

- 프로젝트 초기 환경 구성
- Express 서버 구축
- TypeScript 적용
- Prisma 및 PostgreSQL 연동
- 공통 Error Handler
- Not Found Handler
- Morgan HTTP 요청 로깅
- Winston 로깅
- 로그 파일 저장
- Health Check API

---

# 📝 Log

로그는 `logs` 폴더에 저장됩니다.

```text
logs
├── combined.log
└── error.log
```

---

# 🌿 Branch Strategy

```text
main
 ▲
 │
dev
 ▲
 │
feature/*
```

- **main** : 운영 가능한 코드
- **dev** : 개발 브랜치
- **feature/*** : 기능 개발 브랜치

---

# 💬 Commit Convention

| Type     | Description |
| -------- | ----------- |
| feat     | 기능 추가   |
| fix      | 버그 수정   |
| docs     | 문서 수정   |
| refactor | 리팩토링    |
| chore    | 설정 변경   |
| test     | 테스트      |

예시

```text
feat: 프로젝트 초기 환경 구축
```

---

# 🔀 Pull Request

모든 기능은 Feature 브랜치에서 작업합니다.

```text
feature/* → dev → main
```

PR 작성 시 프로젝트의 PR Template을 사용합니다.
