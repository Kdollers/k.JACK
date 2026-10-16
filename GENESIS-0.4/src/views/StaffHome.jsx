import React from 'react';
import { useI18n } from '../i18n';
import { useApp } from '../context/AppContext';
export default function StaffHome() {
  const { t } = useI18n();
  const { currentUser, currentCompany } = useApp();
  return <section className="bg-white rounded-xl border border-slate-200 p-8 space-y-3">
    <h1 className="text-xl font-bold text-slate-900">{t('staff.welcome', { name: currentUser?.full_name || '' })}</h1>
    <p className="text-sm text-slate-600">{t('staff.company', { name: currentCompany?.name || '' })}</p>
    <p className="text-sm text-slate-600">{t('staff.choose_module')}</p>
  </section>;
}
