import { getProfileImageUrl } from "../../utils/image-url";
import { GIVEAWAY_VISIBILITY } from "./giveaway.type";
import type {
  GiveawayDetailRow,
  GiveawayListRow,
  GiveawayRequestRow,
  MyGiveawayRequestRow,
} from "./giveaway.repository";

type Viewer = {
  id: string;
};

function toImageUrl(imageKey: string): string {
  const imageUrl = getProfileImageUrl(imageKey);

  if (!imageUrl) {
    return imageKey;
  }

  return imageUrl;
}

function toPublicImages(images: GiveawayDetailRow["images"]) {
  return images.map((image) => ({
    id: image.id,
    imageUrl: toImageUrl(image.imageKey),
    sortOrder: image.sortOrder,
  }));
}

function toThumbnailUrl(images: GiveawayListRow["images"]): string | null {
  const thumbnail = images[0];

  if (!thumbnail) {
    return null;
  }

  return toImageUrl(thumbnail.imageKey);
}

export function toGiveawayListItem(giveaway: GiveawayListRow) {
  return {
    id: giveaway.id,
    title: giveaway.title,
    status: giveaway.status,
    createdAt: giveaway.createdAt,
    updatedAt: giveaway.updatedAt,
    author: giveaway.author,
    region: giveaway.region,
    thumbnailUrl: toThumbnailUrl(giveaway.images),
    activeRequestCount: giveaway._count.requests,
  };
}

export function toGiveawayDetail(
  giveaway: GiveawayDetailRow,
  viewer: Viewer,
  myRequest: GiveawayRequestRow | null,
) {
  const isAuthor = giveaway.authorId === viewer.id;
  const isReceiver = giveaway.receiverId === viewer.id;

  return {
    id: giveaway.id,
    title: giveaway.title,
    description: giveaway.description,
    status: giveaway.status,
    createdAt: giveaway.createdAt,
    updatedAt: giveaway.updatedAt,
    author: giveaway.author,
    region: giveaway.region,
    images: toPublicImages(giveaway.images),
    activeRequestCount: giveaway._count.requests,
    receiver: isAuthor || isReceiver ? giveaway.receiver : null,
    myRequest: myRequest
      ? {
          id: myRequest.id,
          status: myRequest.status,
          message: myRequest.message,
          createdAt: myRequest.createdAt,
          updatedAt: myRequest.updatedAt,
        }
      : null,
  };
}

export function toGiveawayRequestItem(request: GiveawayRequestRow) {
  return {
    id: request.id,
    giveawayId: request.giveawayId,
    status: request.status,
    message: request.message,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    requester: request.requester,
  };
}

export function toMyGiveawayRequestItem(request: MyGiveawayRequestRow) {
  return {
    id: request.id,
    status: request.status,
    message: request.message,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    giveaway: {
      id: request.giveaway.id,
      title: request.giveaway.title,
      status: request.giveaway.status,
      author: request.giveaway.author,
      region: request.giveaway.region,
      thumbnailUrl: toThumbnailUrl(request.giveaway.images),
    },
  };
}
