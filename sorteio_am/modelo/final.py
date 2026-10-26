import pandas as pd, numpy as np
g=pd.read_pickle('g.pkl')
def role(r):
    if r.dias==0 or r.gk_dias>=max(3,r.dias): return 'Goleiro'
    if r.zc_rate>=0.5: return 'Zagueiro'
    if (r.g_s>=1.7 and r.share>=0.58) or r.g_s>=2.3: return 'Atacante'
    return 'Meia'
g['pos']=g.apply(role,axis=1)
def flex(r):
    out=[]
    if r.pos=='Goleiro':
        if r.dias>=3: out.append('joga na linha às vezes')
    else:
        if r.gk_dias>=2: out.append('também goleiro (%d dias)'%r.gk_dias)
        if r.pos=='Zagueiro' and r.zc_rate<0.7 and r.dias>=5: out.append('híbrido: ZC em %d%% dos dias'%round(100*r.zc_rate))
        if r.pos!='Zagueiro' and r.zc_rate>=0.3 and r.dias>=4: out.append('às vezes ZC (%d%% dos dias)'%round(100*r.zc_rate))
        if r.pos in('Meia','Atacante') and r.dias_nz>=5:
            if r.pos=='Atacante' and r.g_s<2.3 and r.share<0.62: out.append('limítrofe: perfil meia-atacante')
            if r.pos=='Meia' and (r.g_s>=1.4 and r.share>=0.58): out.append('limítrofe: perfil meia-atacante')
    return '; '.join(out)
g['obs']=g.apply(flex,axis=1)
elenco={'Chico':'Atacante','Adriano':'Atacante','Fil':'Meia','Gepeto':'Zagueiro','Thomas':'Goleiro','André Bigode':'Goleiro','Venilson':'Goleiro'}
chk=[(k,v,g.set_index('atleta').pos[k]) for k,v in elenco.items()]
print(chk)
g['conf']=np.where(g.dias+g.gk_dias>=10,'alta',np.where(g.dias+g.gk_dias>=5,'média','baixa'))
g=g.sort_values(['pos','dias','gk_dias'],ascending=[True,False,False])
out=g[['atleta','pos','conf','dias','gk_dias','zc_rate','g_s','a_s','obs']].copy()
out.columns=['Atleta','Posição proposta','Confiança','Dias na linha','Dias no gol','% dias como ZC','Gols/dia (ajustado)','Assist./dia (ajustado)','Observação']
out['% dias como ZC']=(out['% dias como ZC']*100).round(0)
out.loc[(out['Dias na linha']==0)|(out['Posição proposta']=='Goleiro'),['% dias como ZC','Gols/dia (ajustado)','Assist./dia (ajustado)']]=np.nan
out[['Gols/dia (ajustado)','Assist./dia (ajustado)']]=out[['Gols/dia (ajustado)','Assist./dia (ajustado)']].round(2)
out.to_csv('../dados/posicoes_propostas.csv',index=False,encoding='utf-8-sig')
print(out.pos if False else out[out.Confiança!='baixa'].to_string())
print(out['Posição proposta'].value_counts())
print(out[out.Confiança=='baixa'].groupby('Posição proposta').Atleta.apply(list))
