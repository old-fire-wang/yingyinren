select
a.key_word,
0 as is_result,
count(distinct a.uid) as search_uv,
count(distinct a.timestamp) as search_pv
from
(select distinct
a.dt,
a.uid,
a.token,
a.timestamp,
a.datapool['channel'] as channel,
a.datapool['keyWord'] as key_word,
a.datapool['t'] as terminal
from hdp_zhuanzhuan_dw_global.dw_log_lego_action_1d a
where a.dt between '${startDate}' and '${endDate}'
and a.pagetype = 'HELPSALE-SEARCH'
and a.actiontype = 'ON_SEARCH'
and a.region = 'o'
and coalesce(a.datapool['resultnum'],'0') = '0'
and a.datapool['keyWord'] is not null
and trim(a.datapool['keyWord']) <> ''
) a
group by a.key_word
order by search_uv desc
limit 10000
