// Estate configuration stores ISO codes; labels are shared by every money view.
export const currencyOptions = [
  {code:'MYR',label:'RM',name:'Malaysian ringgit'},
  {code:'NGN',label:'NGN',name:'Nigerian naira'},
  {code:'IDR',label:'IDR',name:'Indonesian rupiah'},
  {code:'USD',label:'USD',name:'US dollar'},
  {code:'SGD',label:'SGD',name:'Singapore dollar'},
  {code:'THB',label:'THB',name:'Thai baht'},
  {code:'GBP',label:'GBP',name:'Pound sterling'},
  {code:'EUR',label:'EUR',name:'Euro'},
  {code:'AUD',label:'AUD',name:'Australian dollar'},
];
export const currencyCodes=currencyOptions.map(c=>c.code);
export const currencyLabel=code=>currencyOptions.find(c=>c.code===code)?.label || code || 'Currency not set';
export function resolveCurrency(configured, sourceCurrencies=[]){
 const sources=[...new Set(sourceCurrencies.filter(Boolean))];
 if(configured&&!currencyCodes.includes(configured))throw new Error('Unsupported estate currency. Update estate setup.');
 if(sources.length>1 || (configured&&sources.some(c=>c!==configured)))throw new Error('Source currency differs from estate setup. Reconcile currencies before combining amounts.');
 return configured || sources[0] || null;
}
