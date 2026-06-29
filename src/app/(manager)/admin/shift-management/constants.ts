import type { RecommendationWeightOption, ShiftForm } from "./types";

export const emptyForm: ShiftForm = {
  date: "",
  startTime: "",
  endTime: "",
  positionId: "",
  positionName: "",
  capacity: "1",
};

export const recommendationWeightOptions: RecommendationWeightOption[] = [
  {
    id: "compatibilityOnly",
    label: "相性のみ",
    compatibilityWeight: 1,
    workScoreWeight: 0,
  },
  {
    id: "compatibility",
    label: "相性重視",
    compatibilityWeight: 0.7,
    workScoreWeight: 0.3,
  },
  {
    id: "balanced",
    label: "バランス",
    compatibilityWeight: 0.5,
    workScoreWeight: 0.5,
  },
  {
    id: "workScore",
    label: "業務スキル重視",
    compatibilityWeight: 0.3,
    workScoreWeight: 0.7,
  },
  {
    id: "workScoreOnly",
    label: "業務スキルのみ",
    compatibilityWeight: 0,
    workScoreWeight: 1,
  },
];

export const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
