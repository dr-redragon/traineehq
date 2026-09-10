import type { FeedbackQuestion } from "@/lib/classic/types";

type Answer = string | number | string[] | undefined;

/**
 * One question on the feedback form, in the public pages' plain markup.
 *
 * The scale is rendered as labelled radio buttons rather than a slider: a slider
 * has no default that is not also an answer, so it cannot tell "5 out of 10"
 * apart from "did not touch it".
 */
export function FeedbackField({
  question,
  value,
  onChange,
}: {
  question: FeedbackQuestion;
  value: Answer;
  onChange: (value: Answer) => void;
}) {
  const label = (
    <label className="fld" htmlFor={question.id}>
      {question.text}
      {question.required && " *"}
    </label>
  );

  if (question.type === "scale") {
    const scale = [1, 2, 3, 4, 5];
    return (
      <div className="field">
        {label}
        <div className="row-actions" style={{ gap: 6 }}>
          {scale.map((n) => (
            <label key={n} className={"yr-pill" + (Number(value) === n ? " on" : "")}>
              <input
                type="radio"
                name={question.id}
                checked={Number(value) === n}
                onChange={() => onChange(n)}
              />
              {n}
            </label>
          ))}
        </div>
        <p className="helper">
          {question.lowLabel ?? "Poor"} → {question.highLabel ?? "Excellent"}
        </p>
      </div>
    );
  }

  if (question.type === "long") {
    return (
      <div className="field">
        {label}
        <textarea
          id={question.id}
          placeholder={question.placeholder}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (question.type === "choice") {
    return (
      <div className="field">
        {label}
        <select
          id={question.id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose…</option>
          {(question.options ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
    );
  }

  if (question.type === "checkbox") {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <div className="field">
        {label}
        {(question.options ?? []).map((option) => (
          <label className="report-check" key={option}>
            <input
              type="checkbox"
              checked={chosen.includes(option)}
              onChange={(e) =>
                onChange(e.target.checked
                  ? [...chosen, option]
                  : chosen.filter((c) => c !== option))}
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="field">
      {label}
      <input
        id={question.id}
        placeholder={question.placeholder}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
