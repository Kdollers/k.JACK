import React from 'react';
import { useI18n } from '../i18n';
import sellerLogo from '../../assets/j-seller.svg';
import administratorLogo from '../../assets/j-administrator.svg';
import networkLogo from '../../assets/j-network.svg';

const logos = { seller: sellerLogo, administrator: administratorLogo, network: networkLogo,
  general: administratorLogo };
export default function BrandMark({ mode = 'administrator', className = 'w-9 h-9' }) {
  const { t } = useI18n();
  return <img src={logos[mode] || administratorLogo} alt={t('brand.logo')}
    className={`${className} shrink-0 rounded-lg shadow`} />;
}
