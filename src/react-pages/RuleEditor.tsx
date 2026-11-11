import { useState } from 'react';

export type RuleDraft = {
  id: string;
  categories: string[];
  types: string[];
  genders: string[];
  sizes: string[];
  shop_ids: string[];
  made_in_canada_only: boolean;
  max_price: number | null;
  min_discount: number;
  frequency: 'weekly';
};

export type Option = { value: string; label: string };

interface Props {
  initialRule?: RuleDraft;
  token: string;
  categories: Option[];
  types: Option[];
  genders: Option[];
  sizes: Option[];
  shops: Option[];
  onSave: (rule: RuleDraft) => void;
  onCancel: () => void;
}

function newRuleId() {
  return `r${Date.now()}`;
}

export function emptyRule(): RuleDraft {
  return {
    id: newRuleId(),
    categories: [],
    types: [],
    genders: [],
    sizes: [],
    shop_ids: [],
    made_in_canada_only: false,
    max_price: null,
    min_discount: 20,
    frequency: 'weekly',
  };
}

function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter(x => x !== v));
    else onChange([...value, v]);
  };

  return (
    <div>
      <div className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">{label}</div>
      <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
        {options.length === 0 && (
          <div className="text-xs text-gray-400">Loading…</div>
        )}
        {options.map(opt => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <input
              type="checkbox"
              checked={value.includes(opt.value)}
              onChange={() => toggle(opt.value)}
              className="h-4 w-4"
            />
            <span className="text-gray-900 dark:text-gray-100">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function RuleEditor({
  initialRule,
  categories,
  types,
  genders,
  sizes,
  shops,
  onSave,
  onCancel,
}: Props) {
  const [rule, setRule] = useState<RuleDraft>(initialRule ?? emptyRule());
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => {
    setRule(r => ({ ...r, [key]: value }));
  };

  const handleSave = () => {
    if (rule.categories.length === 0 &&
        rule.types.length === 0 &&
        rule.shop_ids.length === 0 &&
        rule.min_discount < 15) {
      alert('Please choose at least one category, type, or shop, or set a minimum discount of 15%+.');
      return;
    }
    setSaving(true);
    onSave(rule);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {initialRule ? 'Edit rule' : 'New alert rule'}
          </h2>
          <button
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Cancel
          </button>
        </div>

        <div className="space-y-4">
          <MultiSelect
            label="Categories"
            options={categories}
            value={rule.categories}
            onChange={v => update('categories', v)}
          />
          <MultiSelect
            label="Types"
            options={types}
            value={rule.types}
            onChange={v => update('types', v)}
          />
          <MultiSelect
            label="Gender/Age"
            options={genders}
            value={rule.genders}
            onChange={v => update('genders', v)}
          />
          <MultiSelect
            label="Sizes"
            options={sizes}
            value={rule.sizes}
            onChange={v => update('sizes', v)}
          />
          <MultiSelect
            label="Shops"
            options={shops}
            value={rule.shop_ids}
            onChange={v => update('shop_ids', v)}
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="made-in-canada"
              checked={rule.made_in_canada_only}
              onChange={e => update('made_in_canada_only', e.target.checked)}
              className="h-4 w-4"
            />
            <label
              htmlFor="made-in-canada"
              className="text-sm text-gray-900 dark:text-gray-100"
            >
              Made in Canada only
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Max price ($)
              </label>
              <input
                type="number"
                min={0}
                value={rule.max_price ?? ''}
                onChange={e => update('max_price', e.target.value === '' ? null : Number(e.target.value))}
                placeholder="No limit"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Min discount (%)
              </label>
              <input
                type="number"
                min={0}
                max={99}
                value={rule.min_discount}
                onChange={e => update('min_discount', Number(e.target.value))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Frequency
            </label>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              Weekly (more options coming soon)
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
          >
            {saving ? 'Saving…' : 'Save rule'}
          </button>
        </div>
      </div>
    </div>
  );
}