'use client';

import type { CampaignInfo } from '@/features/generation/generation-types';
import { Field } from '@/components/ui/Primitives';

type ActivityInfoFormProps = {
  value: CampaignInfo;
  onChange: (value: CampaignInfo) => void;
  idPrefix?: string;
};

const fields: Array<{ key: keyof CampaignInfo; label: string; placeholder: string }> = [
  { key: 'storeName', label: '店名', placeholder: '小巷奶茶' },
  { key: 'productName', label: '产品名', placeholder: '柠檬茶' },
  { key: 'price', label: '价格', placeholder: '19.9' },
  { key: 'campaignTime', label: '活动时间', placeholder: '今日 / 本周末 / 5月20日' },
  { key: 'address', label: '地址', placeholder: '门店地址' },
  { key: 'phone', label: '电话', placeholder: '联系电话' },
  { key: 'extraSellingPoints', label: '补充卖点', placeholder: '第二杯半价、现做现喝' },
];

export function ActivityInfoForm({
  idPrefix = 'campaign',
  value,
  onChange,
}: ActivityInfoFormProps) {
  return (
    <div className="grid gap-3">
      {fields.map((field) => (
        <Field
          id={`${idPrefix}-${field.key}`}
          key={field.key}
          label={field.label}
          onChange={(event) =>
            onChange({ ...value, [field.key]: event.target.value })
          }
          placeholder={field.placeholder}
          value={value[field.key] ?? ''}
        />
      ))}
    </div>
  );
}
