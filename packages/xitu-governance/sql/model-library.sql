select distinct
  c.cate_name,
  c.cate_id,
  brand.brand_name,
  brand.brand_id,
  model.model_name,
  model.model_id
from hdp_zhuanzhuan_dim_global.dim_t_cate_template_model_rel_full_1d a
left join hdp_zhuanzhuan_dim_global.dim_info_brand_full_1d_0p brand
  on brand.brand_id = a.brand_id
left join hdp_zhuanzhuan_dim_global.dim_info_model_full_1d_0p model
  on model.model_id = a.model_id
left join hdp_zhuanzhuan_dim_global.dim_info_cate_template_category_rel_full_1d ctc
  on ctc.cate_template_id = a.cate_template_id
  and ctc.dt = '${outFileSuffix}'
  and ctc.business_line in (13)
left join hdp_zhuanzhuan_dim_global.dim_info_category_full_1d_0p c
  on c.cate_id = ctc.cate_id
where a.dt = '${outFileSuffix}'
  and a.status = 1
  and a.scene_tag regexp '1'
  and model.model_name is not null
  and trim(model.model_name) <> ''
