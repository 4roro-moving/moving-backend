export const NOTICES = [
  {
    title: "무빙 서비스 오픈 안내",
    content:
      "안녕하세요, 무빙입니다.\n\n이사 견적 매칭 서비스 무빙이 정식 오픈했습니다.\n원하는 조건으로 견적을 요청하시면 여러 기사님의 견적을 비교하실 수 있습니다.\n\n많은 이용 부탁드립니다.",
    audience: "ALL" as const,
    isPinned: true,
    sendNotification: true,
  },
  {
    title: "개인정보 처리방침 개정 안내",
    content:
      "개인정보 처리방침이 일부 개정되었습니다.\n\n주요 변경 사항은 보관 기간 명시 및 위탁 업체 추가입니다.\n자세한 내용은 하단 링크에서 확인하실 수 있습니다.",
    audience: "ALL" as const,
    isPinned: false,
    sendNotification: false,
  },
  {
    title: "기사님 프로필 등록 가이드",
    content:
      "프로필을 완성하시면 고객님께 노출될 확률이 높아집니다.\n\n경력, 서비스 가능 지역, 이사 유형을 빠짐없이 입력해 주세요.\n한 줄 소개는 고객님이 가장 먼저 보는 항목입니다.",
    audience: "MOVER" as const,
    isPinned: false,
    sendNotification: true,
  },
  {
    title: "견적 요청 시 유의사항",
    content:
      "견적 요청은 진행 중인 건이 있을 경우 추가로 생성할 수 없습니다.\n\n기존 요청을 취소하신 후 새로 등록해 주세요.\n이사 예정일은 오늘 이후 날짜만 선택 가능합니다.",
    audience: "CUSTOMER" as const,
    isPinned: false,
    sendNotification: false,
  },
  {
    title: "설 연휴 고객센터 운영 안내",
    content:
      "설 연휴 기간 동안 고객센터 운영이 일시 중단됩니다.\n\n문의는 1:1 문의로 남겨주시면 순차적으로 답변드리겠습니다.",
    audience: "ALL" as const,
    isPinned: false,
    isVisible: false,
    sendNotification: false,
  },
];

export const FAQS = [
  {
    question: "견적 요청은 어떻게 하나요?",
    answer:
      "로그인 후 견적 요청하기 버튼을 눌러 이사 유형, 이사 예정일, 출발지와 도착지를 입력하시면 됩니다. 요청이 등록되면 조건에 맞는 기사님들께 알림이 발송됩니다.",
    sortOrder: 1,
  },
  {
    question: "견적은 몇 개까지 받을 수 있나요?",
    answer: "하나의 견적 요청당 최대 5개의 견적을 받으실 수 있습니다.",
    sortOrder: 2,
  },
  {
    question: "특정 기사님께 견적을 요청할 수 있나요?",
    answer:
      "가능합니다. 기사님 상세 페이지에서 지정 견적 요청을 하시면 되며, 하나의 요청당 최대 3명까지 지정하실 수 있습니다.",
    sortOrder: 3,
  },
  {
    question: "견적 요청을 수정할 수 있나요?",
    answer:
      "견적이 한 건이라도 도착하기 전까지는 수정하실 수 있습니다. 견적이 도착한 이후에는 취소 후 새로 등록해 주세요.",
    sortOrder: 4,
  },
  {
    question: "리뷰는 언제 작성할 수 있나요?",
    answer: "이사가 완료된 견적에 한해 작성하실 수 있습니다.",
    sortOrder: 5,
  },
  {
    question: "계정이 정지되었습니다. 어떻게 해야 하나요?",
    answer:
      "1:1 문의를 통해 이의를 제기하실 수 있습니다. 정지 사유를 확인하신 후 문의를 남겨주시면 관리자가 검토 후 답변드립니다.",
    sortOrder: 6,
  },
  {
    question: "탈퇴 후 재가입이 가능한가요?",
    answer: "동일한 이메일로 재가입이 가능합니다. 다만 이전 이용 내역은 복구되지 않습니다.",
    sortOrder: 7,
    isVisible: false,
  },
];

export const INQUIRIES = [
  {
    /** customers 배열의 인덱스 */
    authorIndex: 0,
    category: "SERVICE" as const,
    title: "견적 요청이 등록되지 않습니다",
    status: "ANSWERED" as const,
    messages: [
      { isAdmin: false, content: "견적 요청을 하려는데 계속 오류가 납니다. 확인 부탁드립니다." },
      {
        isAdmin: true,
        content:
          "안녕하세요, 무빙입니다.\n진행 중인 견적 요청이 있는 경우 추가 등록이 제한됩니다.\n기존 요청을 취소하신 후 다시 시도해 주세요.",
      },
    ],
  },
  {
    authorIndex: 1,
    category: "ACCOUNT" as const,
    title: "비밀번호 변경이 안 됩니다",
    status: "OPEN" as const,
    messages: [{ isAdmin: false, content: "비밀번호를 바꾸려는데 인증 메일이 오지 않습니다." }],
  },
  {
    authorIndex: 2,
    category: "SUSPENSION_APPEAL" as const,
    title: "계정 정지 이의 제기합니다",
    status: "OPEN" as const,
    messages: [
      {
        isAdmin: false,
        content: "허위 리뷰를 작성한 적이 없습니다. 정지 사유를 다시 확인해 주시기 바랍니다.",
      },
    ],
  },
  {
    authorIndex: 3,
    category: "ETC" as const,
    title: "제휴 문의드립니다",
    status: "CLOSED" as const,
    messages: [
      { isAdmin: false, content: "기업 제휴 관련해서 담당자분과 이야기하고 싶습니다." },
      {
        isAdmin: true,
        content: "제휴 문의는 partnership@moving.test 로 보내주시면 확인 후 연락드리겠습니다.",
      },
      { isAdmin: false, content: "확인했습니다. 감사합니다." },
    ],
  },
];
