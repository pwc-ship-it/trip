/* ── 기본 더미 데이터 ── */
var DEF = {
  "sites": [
    {"id": "ESHD",    "name": "ESHD",       "color": "#1558a0", "groupId": "lges", "country": "usa",     "region": "americas"},
    {"id": "ESMI",    "name": "ESMI",        "color": "#72128c", "groupId": "lges", "country": "usa",     "region": "americas"},
    {"id": "ESHG",    "name": "ESHG",        "color": "#3C3489", "groupId": "lges", "country": "usa",     "region": "americas"},
    {"id": "MILS",    "name": "MILS",        "color": "#2e6e18", "groupId": "lges", "country": "usa",     "region": "americas"},
    {"id": "UC2",     "name": "UC2",         "color": "#4a7a10", "groupId": "lges", "country": "usa",     "region": "americas"},
    {"id": "현대JV",  "name": "현대JV",      "color": "#1a6080", "groupId": "lges", "country": "usa",     "region": "americas"},
    {"id": "BOSK_TN", "name": "BOSK_TN",    "color": "#2a5040", "groupId": "lges", "country": "usa",     "region": "americas"},
    {"id": "ESOT",    "name": "ESOT",        "color": "#7a4208", "groupId": "lges", "country": "canada",  "region": "canada"},
    {"id": "ESNA",    "name": "ESNA",        "color": "#0a5e40", "groupId": "lges", "country": "china",   "region": "china"},
    {"id": "ESNB",    "name": "ESNB",        "color": "#0e7050", "groupId": "lges", "country": "china",   "region": "china"},
    {"id": "DSBJ",    "name": "DSBJ(소주)",  "color": "#1a8060", "groupId": "lges", "country": "china",   "region": "china"},
    {"id": "SDD",     "name": "SDD(동관)",   "color": "#108050", "groupId": "lges", "country": "china",   "region": "china"},
    {"id": "SDV",     "name": "SDV",         "color": "#806010", "groupId": "lges", "country": "vietnam", "region": "vietnam"},
    {"id": "WA",      "name": "WA",          "color": "#8a2a10", "groupId": "lges", "country": "poland",  "region": "europe"}
  ],
  "projects": [
    {"id": "p1", "siteId": "ESHD", "name": "2세대 셋업+양산"},
    {"id": "p2", "siteId": "MILS", "name": "포밀비전 6대"},
    {"id": "p3", "siteId": "UC2", "name": "포밀비전 6대"},
    {"id": "p4", "siteId": "ESOT", "name": "1.5세대 셋업"},
    {"id": "p5", "siteId": "WA", "name": "1.5세대 안정화 / 탈리비전 안정화"},
    {"id": "p6", "siteId": "ESHG", "name": "DNC (AZS) 셋업+양산"},
    {"id": "p7", "siteId": "ESNA", "name": "NA 스플리터 제거 작업"},
    {"id": "p8", "siteId": "ESMI", "name": "셋업 및 양산대응"}
  ],
  "schedules": [
    {"id": "s1", "projectId": "p1", "task": "셋업", "name": "박영식", "type": "outsource", "start": "2026-02-20", "end": "2026-05-05", "note": ""},
    {"id": "s2", "projectId": "p1", "task": "셋업", "name": "전성준", "type": "outsource", "start": "2026-02-20", "end": "2026-05-05", "note": ""},
    {"id": "s3", "projectId": "p1", "task": "셋업", "name": "김성민", "type": "hq", "start": "2026-03-23", "end": "2026-06-12", "note": ""},
    {"id": "s4", "projectId": "p1", "task": "셋업", "name": "김승민", "type": "hq", "start": "2026-04-11", "end": "2026-06-27", "note": ""},
    {"id": "s5", "projectId": "p1", "task": "셋업", "name": "미지정", "type": "outsource", "start": "2026-04-06", "end": "2026-06-27", "note": ""},
    {"id": "s6", "projectId": "p1", "task": "대응", "name": "강민호", "type": "hq", "start": "2026-06-06", "end": "2026-08-21", "note": ""},
    {"id": "s7", "projectId": "p3", "task": "셋업", "name": "송윤선", "type": "outsource", "start": "2026-03-15", "end": "2026-06-10", "note": ""},
    {"id": "s8", "projectId": "p4", "task": "셋업", "name": "최철명", "type": "hq", "start": "2026-03-16", "end": "2026-06-12", "note": ""},
    {"id": "s9", "projectId": "p4", "task": "셋업", "name": "김세휘", "type": "hq", "start": "2026-03-16", "end": "2026-06-12", "note": ""},
    {"id": "s10", "projectId": "p4", "task": "대응", "name": "준테크4인", "type": "outsource", "start": "2026-01-01", "end": "2026-06-30", "note": ""},
    {"id": "s11", "projectId": "p5", "task": "셋업", "name": "유현우", "type": "hq", "start": "2026-03-02", "end": "2026-06-12", "note": ""},
    {"id": "s12", "projectId": "p5", "task": "셋업", "name": "안홍석", "type": "outsource", "start": "2026-03-30", "end": "2026-05-06", "note": ""},
    {"id": "s13", "projectId": "p5", "task": "셋업", "name": "조장희", "type": "hq", "start": "2026-04-20", "end": "2026-06-12", "note": ""},
    {"id": "s14", "projectId": "p5", "task": "셋업", "name": "김지환", "type": "hq", "start": "2026-06-05", "end": "2026-08-21", "note": ""},
    {"id": "s15", "projectId": "p6", "task": "셋업", "name": "박용대", "type": "hq", "start": "2026-01-21", "end": "2026-04-20", "note": ""},
    {"id": "s16", "projectId": "p6", "task": "셋업", "name": "남상일", "type": "hq", "start": "2026-01-21", "end": "2026-04-20", "note": ""},
    {"id": "s17", "projectId": "p6", "task": "셋업", "name": "위동영", "type": "hq", "start": "2026-01-03", "end": "2026-09-15", "note": ""},
    {"id": "s18", "projectId": "p6", "task": "셋업", "name": "신호중", "type": "hq", "start": "2026-04-17", "end": "2026-07-03", "note": ""},
    {"id": "s19", "projectId": "p6", "task": "셋업", "name": "최형민", "type": "hq", "start": "2026-04-16", "end": "2026-06-30", "note": ""},
    {"id": "s20", "projectId": "p6", "task": "대응", "name": "(시티즌) 2명", "type": "outsource", "start": "2026-03-11", "end": "2026-09-15", "note": ""},
    {"id": "s21", "projectId": "p7", "task": "개조", "name": "강민호", "type": "hq", "start": "2026-04-20", "end": "2026-05-02", "note": ""},
    {"id": "s22", "projectId": "p7", "task": "개조", "name": "미지정", "type": "outsource", "start": "2026-04-20", "end": "2026-05-02", "note": ""},
    {"id": "s23", "projectId": "p8", "task": "셋업", "name": "김경태", "type": "hq", "start": "2026-03-21", "end": "2026-06-06", "note": ""},
    {"id": "s24", "projectId": "p8", "task": "대응", "name": "조용훈", "type": "outsource", "start": "2026-02-02", "end": "2026-05-01", "note": ""},
    {"id": "s25", "projectId": "p8", "task": "대응", "name": "김장희", "type": "outsource", "start": "2026-02-02", "end": "2026-05-01", "note": ""}
  ],
  "events": [
    {"id": "e1", "projectId": "p6", "date": "2026-04-06", "title": "양산시작", "colorId": "red"},
    {"id": "e2", "projectId": "p1", "date": "2026-04-06", "title": "2주간 부동", "colorId": "red"}
  ],
  "workTasks": [],
  "equipItems": [
    {"id":"ei1",  "name":"FAB-in",                    "groupName":"",    "order":0},
    {"id":"ei2",  "name":"Installation",              "groupName":"",    "order":1},
    {"id":"ei3",  "name":"Turn On (Ele.)",             "groupName":"SAT", "order":2},
    {"id":"ei4",  "name":"Turn On (CDA)",              "groupName":"SAT", "order":3},
    {"id":"ei5",  "name":"I/O Check (Vision)",         "groupName":"SAT", "order":4},
    {"id":"ei6",  "name":"I/O Check (PLC연동)",        "groupName":"SAT", "order":5},
    {"id":"ei7",  "name":"IP/IQ check",               "groupName":"SAT", "order":6},
    {"id":"ei8",  "name":"Calibration",               "groupName":"SAT", "order":7},
    {"id":"ei9",  "name":"GRR",                       "groupName":"SAT", "order":8},
    {"id":"ei10", "name":"QA검증 (MSA 대표 1-A)",      "groupName":"SAT", "order":9},
    {"id":"ei11", "name":"QA검증 (Error Proofing)",    "groupName":"SAT", "order":10},
    {"id":"ei12", "name":"SAT",                       "groupName":"SAT", "order":11},
    {"id":"ei13", "name":"QA망 포설",                  "groupName":"IT",  "order":12},
    {"id":"ei14", "name":"IP Activation",             "groupName":"IT",  "order":13},
    {"id":"ei15", "name":"Agent Ins",                 "groupName":"IT",  "order":14},
    {"id":"ei16", "name":"SPC+ 개통",                 "groupName":"IT",  "order":15},
    {"id":"ei17", "name":"NQVM Ins",                  "groupName":"IT",  "order":16},
    {"id":"ei18", "name":"방화벽",                    "groupName":"IT",  "order":17},
    {"id":"ei19", "name":"SPC 정합성 (이미지/데이터)","groupName":"IT",  "order":18},
    {"id":"ei20", "name":"Sample Ready",              "groupName":"",    "order":19},
    {"id":"ei21", "name":"양산시작",                  "groupName":"",    "order":20}
  ],
  "equipUnits": [],
  "visionEquips": [],
  "visionTemplate": {
    "categories": [
      {
        "id": "vc_basic", "name": "기본정보", "order": 0,
        "items": [
          {"id":"vi_site",    "name":"사이트",   "type":"text",        "order":0, "showInGrid":false},
          {"id":"vi_line",    "name":"라인",     "type":"text",        "order":1, "showInGrid":false},
          {"id":"vi_unit",    "name":"호기",     "type":"text",        "order":2, "showInGrid":false},
          {"id":"vi_type",    "name":"Type",     "type":"multiselect", "order":3, "showInGrid":false,
           "options":["Notching","Delamination","Foil","NGMarking","DNC_Notching","DNC_Cutting"]},
          {"id":"vi_sn",      "name":"S/N",      "type":"text",        "order":4, "showInGrid":false},
          {"id":"vi_program", "name":"Program",  "type":"type-program","order":5, "showInGrid":true},
          {"id":"vi_notes",   "name":"특이사항", "type":"textarea",    "order":6, "showInGrid":false}
        ]
      },
      {
        "id": "vc_vision", "name": "Vision", "order": 1,
        "groups": [
          {
            "id":"vg_camera","name":"CAMERA","order":0,
            "items":[
              {"id":"vi_cameras","name":"Camera","type":"type-camera","order":0,"showInGrid":true}
            ]
          },
          {
            "id":"vg_light","name":"ILLUMINATION","order":1,
            "items":[
              {"id":"vi_illumination","name":"Illumination","type":"type-illum","order":0,"showInGrid":false}
            ]
          }
        ]
      },
      {
        "id": "vc_board", "name": "Board", "order": 2,
        "groups": [
          {
            "id":"vg_trig","name":"TRIGGER BOARD","order":0,
            "items":[
              {"id":"vi_board_trig","name":"Trigger Board","type":"board-multi","order":0,"showInGrid":false,
               "labels":["사용 용도","BOARD 버전","FIRMWARE"]}
            ]
          }
        ]
      },
      {
        "id": "vc_pc", "name": "PC", "order": 3,
        "items": [
          {"id":"vi_pc","name":"PC","type":"type-pc","order":0,"showInGrid":false}
        ]
      }
    ]
  },
  "groups": [
    {"id": "lges", "name": "LGES(해외)"},
    {"id": "skon", "name": "SKON(해외)"},
    {"id": "display", "name": "DISPLAY(해외)"},
    {"id": "domestic", "name": "국내"}
  ]
};