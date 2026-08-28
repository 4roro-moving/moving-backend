import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { faqRepository } from "./faq.repository";
import { faqService } from "./faq.service";

describe("faqService.getFaqList", () => {
  it("FAQ 검색어를 question과 answer에 모두 적용하고 LIKE 와일드카드를 이스케이프한다", async () => {
    const originalFindManyWithCount = faqRepository.findManyWithCount;
    let receivedParams: Parameters<typeof faqRepository.findManyWithCount>[0] | undefined;

    faqRepository.findManyWithCount = async (params) => {
      receivedParams = params;

      return {
        faqs: [],
        totalCount: 0,
      };
    };

    try {
      await faqService.getFaqList({
        page: 2,
        limit: 10,
        keyword: "100%_test",
        isVisible: true,
      });
    } finally {
      faqRepository.findManyWithCount = originalFindManyWithCount;
    }

    assert.deepEqual(receivedParams, {
      skip: 10,
      take: 10,
      where: {
        OR: [
          {
            question: {
              contains: "100\\%\\_test",
              mode: "insensitive",
            },
          },
          {
            answer: {
              contains: "100\\%\\_test",
              mode: "insensitive",
            },
          },
        ],
        isVisible: true,
      },
    });
  });
});
