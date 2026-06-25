import { recommendationWeightOptions } from "../constants";
import type { RecommendationWeightOption } from "../types";

export function WeightSelector({
  selectedWeightId,
  onSelect,
}: {
  selectedWeightId: RecommendationWeightOption["id"];
  onSelect: (id: RecommendationWeightOption["id"]) => void;
}) {
  return (
    <section className="mt-5 rounded-lg border border-black/10 bg-[#f7f8fb] px-4 py-4">
      <p className="text-sm font-semibold">おすすめ計算の比重</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {recommendationWeightOptions.map((option) => {
          const selected = option.id === selectedWeightId;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              className={[
                "rounded-md border px-3 py-2 text-left text-sm transition",
                selected
                  ? "border-[#1763ff] bg-[#eff6ff] text-[#1d4ed8]"
                  : "border-black/10 bg-white text-[#475569] hover:bg-[#eef2f7]",
              ].join(" ")}
            >
              <span className="block font-semibold">{option.label}</span>
              <span className="mt-1 block text-xs">
                相性 {Math.round(option.compatibilityWeight * 100)}% / 業務スキル{" "}
                {Math.round(option.workScoreWeight * 100)}%
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
