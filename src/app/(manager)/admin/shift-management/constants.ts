import type { RecommendationWeightOption, ShiftForm } from "./types";

export const emptyForm: ShiftForm = {
  date: "",
  startTime: "",
  endTime: "",
  capacity: "1",
};

export const recommendationWeightOptions: RecommendationWeightOption[] = [
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
];

export const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
