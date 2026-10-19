(() => {
  const cfg=window.AURA_SUPABASE_CONFIG;
  if(!cfg?.url||!cfg?.publishableKey||!window.supabase?.createClient)return;
  const client=window.supabase.createClient(cfg.url,cfg.publishableKey);
  const keys={products:'aura_piercings_v1',orders:'aura_orders_v1',settings:'aura_store_settings_v1',whatsapp:'aura_whatsapp_v1'};
  const parse=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}catch{return fallback}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const result=(data,error)=>{if(error)throw error;return data};
  async function loadPublic(){
    const [catalog,store]=await Promise.all([
      client.from('catalog_state').select('products').eq('id','main').maybeSingle(),
      client.from('store_state').select('settings').eq('id','main').maybeSingle()
    ]);
    if(catalog.error)console.warn('Catálogo online indisponível:',catalog.error.message);
    else if(Array.isArray(catalog.data?.products)&&catalog.data.products.length)write(keys.products,catalog.data.products);
    if(store.error)console.warn('Configuração online indisponível:',store.error.message);
    else if(store.data?.settings&&Object.keys(store.data.settings).length){
      write(keys.settings,store.data.settings);
      if(store.data.settings.whatsapp)localStorage.setItem(keys.whatsapp,store.data.settings.whatsapp);
    }
  }
  async function saveCatalog(products){return result(await client.from('catalog_state').upsert({id:'main',products,updated_at:new Date().toISOString()}));}
  async function saveSettings(settings){return result(await client.from('store_state').upsert({id:'main',settings,updated_at:new Date().toISOString()}));}
  async function signIn(email,password){return result(await client.auth.signInWithPassword({email,password}));}
  async function getSession(){return result(await client.auth.getSession()).data?.session||null;}
  async function loadAdminData(){
    const localProducts=parse(keys.products,[]),localSettings=parse(keys.settings,{}),localOrders=parse(keys.orders,[]);
    const [catalog,store,orders]=await Promise.all([
      client.from('catalog_state').select('products').eq('id','main').maybeSingle(),
      client.from('store_state').select('settings').eq('id','main').maybeSingle(),
      client.from('orders').select('*').order('created_at',{ascending:false})
    ]);
    result(catalog.data,catalog.error);result(store.data,store.error);result(orders.data,orders.error);
    const remoteProducts=catalog.data?.products;
    if(Array.isArray(remoteProducts)&&remoteProducts.length)write(keys.products,remoteProducts);
    else if(localProducts.length)await saveCatalog(localProducts);
    const remoteSettings=store.data?.settings;
    if(remoteSettings&&Object.keys(remoteSettings).length){write(keys.settings,remoteSettings);if(remoteSettings.whatsapp)localStorage.setItem(keys.whatsapp,remoteSettings.whatsapp)}
    else if(Object.keys(localSettings).length||localStorage.getItem(keys.whatsapp))await saveSettings({...localSettings,whatsapp:localStorage.getItem(keys.whatsapp)||''});
    if(orders.data?.length){write(keys.orders,orders.data.map(o=>({id:o.id,number:o.number,createdAt:o.created_at,status:o.status,customer:o.customer,items:o.items,total:o.total})))}
    else if(localOrders.length){for(const order of localOrders)await saveOrder(order)}
    return true;
  }
  async function saveOrder(order){return result(await client.from('orders').upsert({id:order.id,number:order.number,created_at:order.createdAt,status:order.status||'Novo',customer:order.customer,items:order.items||[],total:order.total??null},{onConflict:'id'}));}
  async function updateOrder(id,status){return result(await client.from('orders').update({status}).eq('id',id));}
  async function deleteOrder(id){return result(await client.from('orders').delete().eq('id',id));}
  window.auraCloud={client,ready:loadPublic(),signIn,getSession,loadAdminData,saveCatalog,saveSettings,saveOrder,updateOrder,deleteOrder};
})();
