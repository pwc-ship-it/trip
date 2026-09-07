---
name: vam-test
description: VAM 전체 테스트 강제 실행. "테스트 실행해줘", "테스트 돌려줘", "/vam-test" 로 호출.
---

VAM 전체 테스트 스위트를 즉시 실행합니다.

## 실행 절차

1. 아래 명령어로 전체 테스트를 실행하세요:

```bash
python .claude/scripts/run-tests.py --force
```

2. 실패한 항목이 있으면 상세 원인을 확인합니다:

```bash
cd backend && python -m pytest tests/ -v --tb=long
```

3. JS 문법 오류가 있으면:

```bash
node --check app-core.js app-auth.js app-render.js app-actions.js app-admin.js app-ui.js app-init.js
```

## 결과 해석

- **✅ 모든 테스트 통과** → 코드 변경이 기존 기능을 깨뜨리지 않았습니다.
- **❌ JS 문법 오류** → 브라우저에서 앱이 안 열립니다. vam-coder에게 수정 요청하세요.
- **❌ Python 문법 오류** → 백엔드가 시작 안 됩니다. vam-coder에게 수정 요청하세요.
- **❌ test_health_ok 실패** → 백엔드 서버가 응답 없습니다. Azure Portal에서 재시작하세요.
- **❌ test_*_requires_auth 실패** → 보안 문제입니다. vam-debugger에게 즉시 분석 요청하세요.

테스트 결과를 복사해서 vam-tester 에이전트에게 전달하면 상세 분석을 받을 수 있습니다.
