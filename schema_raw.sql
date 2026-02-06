--
-- PostgreSQL database dump
--

\restrict VsLxd8CUjLSlUEf09w8bGUOkuz1ee6XkkRH8oJZzIeBKYbHVXOndn9Nu3txD0Np

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: products_with_details_core; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products_with_details_core (
    id bigint NOT NULL,
    title text,
    shop_id bigint,
    shop_name text,
    created_at timestamp with time zone,
    url text,
    description text,
    updated_at_external timestamp with time zone,
    in_stock boolean,
    min_price numeric,
    max_discount_percentage numeric,
    on_sale boolean,
    variants jsonb,
    images jsonb,
    fts tsvector,
    last_updated timestamp with time zone DEFAULT now(),
    product_type text,
    tags text[],
    updated_at timestamp with time zone,
    vendor text,
    handle text,
    published_at_external timestamp with time zone,
    last_modified timestamp with time zone,
    grouped_product_type text,
    top_level_category text,
    subcategory text,
    gender_age text,
    size_groups text[],
    gender_categories text[] DEFAULT '{}'::text[],
    is_unisex boolean DEFAULT false,
    description_format text,
    shop_domain text,
    is_archived boolean DEFAULT false,
    archived_at timestamp without time zone,
    scheduled_hard_delete timestamp without time zone
);
ALTER TABLE ONLY public.products_with_details_core ALTER COLUMN min_price SET STATISTICS 1000;
ALTER TABLE ONLY public.products_with_details_core ALTER COLUMN max_discount_percentage SET STATISTICS 1000;


--
-- Name: distinct_gender_ages; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.distinct_gender_ages WITH (security_invoker='on') AS
 SELECT DISTINCT COALESCE(NULLIF(TRIM(BOTH FROM gender_age), ''::text), 'Unisex'::text) AS gender_age
   FROM public.products_with_details_core
  WHERE (gender_age IS NOT NULL)
  ORDER BY COALESCE(NULLIF(TRIM(BOTH FROM gender_age), ''::text), 'Unisex'::text);


--
-- Name: distinct_grouped_types; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.distinct_grouped_types WITH (security_invoker='on') AS
 SELECT DISTINCT COALESCE(NULLIF(TRIM(BOTH FROM grouped_product_type), ''::text), 'Uncategorized'::text) AS grouped_product_type
   FROM public.products_with_details_core
  WHERE (grouped_product_type IS NOT NULL)
  ORDER BY COALESCE(NULLIF(TRIM(BOTH FROM grouped_product_type), ''::text), 'Uncategorized'::text);


--
-- Name: shops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shops (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    url text,
    category text,
    shop_name text,
    tags text[],
    updated_at timestamp without time zone,
    is_shopify boolean,
    location text
);


--
-- Name: distinct_shops; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.distinct_shops WITH (security_invoker='on') AS
 SELECT id,
    COALESCE(shop_name, 'Unknown Shop'::text) AS name
   FROM public.shops s
  WHERE ((shop_name IS NOT NULL) AND (shop_name <> ''::text) AND (EXISTS ( SELECT 1
           FROM public.products_with_details_core p
          WHERE (p.shop_id = s.id))))
  ORDER BY shop_name;


--
-- Name: variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variants (
    id bigint NOT NULL,
    product_id bigint,
    title text,
    price numeric(10,2),
    available boolean,
    compare_at_price numeric(10,2),
    discount_percentage numeric GENERATED ALWAYS AS (
CASE
    WHEN (compare_at_price > (0)::numeric) THEN (((1)::numeric - (price / compare_at_price)) * (100)::numeric)
    ELSE (0)::numeric
END) STORED,
    updated_at timestamp with time zone DEFAULT now(),
    size text,
    sort_order_1 integer,
    sort_order_2 integer
);


--
-- Name: distinct_size_groups; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.distinct_size_groups WITH (security_invoker='on') AS
 SELECT size AS size_group,
    min(sort_order_1) AS sort_order_1,
    min(sort_order_2) AS sort_order_2
   FROM public.variants
  WHERE ((size IS NOT NULL) AND (size <> ''::text) AND (available = true))
  GROUP BY size
  ORDER BY (min(sort_order_1)), (min(sort_order_2)), size;


--
-- Name: distinct_top_level_categories; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.distinct_top_level_categories WITH (security_invoker='true') AS
 SELECT DISTINCT COALESCE(NULLIF(TRIM(BOTH FROM top_level_category), ''::text), 'Uncategorized'::text) AS top_level_category
   FROM public.products_with_details_core
  WHERE (top_level_category IS NOT NULL);


--
-- Name: distinct_variant_titles; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.distinct_variant_titles WITH (security_invoker='on') AS
 SELECT DISTINCT title
   FROM public.variants
  WHERE ((title IS NOT NULL) AND (title <> ''::text) AND (title ~ '^[a-zA-Z0-9]'::text));


--
-- Name: images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.images (
    id bigint NOT NULL,
    product_id bigint,
    src text,
    width smallint,
    height smallint,
    "position" smallint,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    alt text,
    collection_id bigint,
    last_modified timestamp with time zone DEFAULT now() NOT NULL,
    version text
);


--
-- Name: products_enriched_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products_enriched_data (
    product_id bigint NOT NULL,
    size_groups text[] DEFAULT ARRAY[]::text[],
    categories text[] DEFAULT ARRAY[]::text[],
    last_enriched timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    phone text,
    username text,
    first_name text,
    last_name text
);


--
-- Name: shops_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.shops ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.shops_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: size_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.size_groups (
    size_group text NOT NULL,
    sort_order_1 integer NOT NULL,
    sort_order_2 integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: images images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.images
    ADD CONSTRAINT images_pkey PRIMARY KEY (id);


--
-- Name: products_enriched_data products_enriched_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products_enriched_data
    ADD CONSTRAINT products_enriched_data_pkey PRIMARY KEY (product_id);


--
-- Name: products_with_details_core products_with_details_core_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products_with_details_core
    ADD CONSTRAINT products_with_details_core_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: shops shops_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shops
    ADD CONSTRAINT shops_id_key UNIQUE (id);


--
-- Name: shops shops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shops
    ADD CONSTRAINT shops_pkey PRIMARY KEY (id);


--
-- Name: shops shops_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shops
    ADD CONSTRAINT shops_url_key UNIQUE (url);


--
-- Name: size_groups size_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.size_groups
    ADD CONSTRAINT size_groups_pkey PRIMARY KEY (size_group);


--
-- Name: variants variants_optimized_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_optimized_pkey PRIMARY KEY (id);


--
-- Name: idx_enriched_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enriched_product_id ON public.products_enriched_data USING btree (product_id);


--
-- Name: idx_enriched_size_groups_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enriched_size_groups_gin ON public.products_enriched_data USING gin (size_groups);


--
-- Name: idx_images_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_images_product_id ON public.images USING btree (product_id);


--
-- Name: idx_products_category_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category_composite ON public.products_with_details_core USING btree (top_level_category, grouped_product_type, gender_age, min_price) WHERE ((in_stock = true) AND (is_archived = false) AND (product_type IS NOT NULL) AND (product_type <> ALL (ARRAY['Insurance'::text, 'Shipping'::text])));


--
-- Name: idx_products_category_filters; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category_filters ON public.products_with_details_core USING btree (top_level_category, gender_age, grouped_product_type) WHERE ((in_stock = true) AND (is_archived = false));


--
-- Name: idx_products_discount_categories; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_discount_categories ON public.products_with_details_core USING btree (top_level_category, grouped_product_type, gender_age, max_discount_percentage DESC NULLS LAST, created_at DESC, id DESC) WHERE ((in_stock = true) AND (is_archived = false) AND (product_type IS NOT NULL) AND (product_type <> ALL (ARRAY['Insurance'::text, 'Shipping'::text])));


--
-- Name: idx_products_discount_composite_flexible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_discount_composite_flexible ON public.products_with_details_core USING btree (max_discount_percentage DESC NULLS LAST, created_at DESC, id DESC) WHERE ((in_stock = true) AND (is_archived = false) AND (product_type IS NOT NULL) AND (product_type <> ALL (ARRAY['Insurance'::text, 'Shipping'::text])));


--
-- Name: idx_products_discount_price_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_discount_price_composite ON public.products_with_details_core USING btree (max_discount_percentage DESC NULLS LAST, min_price, id DESC) WHERE ((in_stock = true) AND (is_archived = false) AND (product_type IS NOT NULL) AND (product_type <> ALL (ARRAY['Insurance'::text, 'Shipping'::text])));


--
-- Name: idx_products_discount_with_price; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_discount_with_price ON public.products_with_details_core USING btree (max_discount_percentage DESC NULLS LAST, min_price, id DESC) WHERE ((in_stock = true) AND (is_archived = false) AND (product_type IS NOT NULL) AND (product_type <> ALL (ARRAY['Insurance'::text, 'Shipping'::text])));


--
-- Name: idx_products_fts_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_fts_gin ON public.products_with_details_core USING gin (fts);


--
-- Name: idx_products_fts_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_fts_search ON public.products_with_details_core USING gin (fts) WHERE ((in_stock = true) AND (is_archived = false));


--
-- Name: idx_products_newest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_newest ON public.products_with_details_core USING btree (created_at DESC, id DESC) WHERE ((in_stock = true) AND (is_archived = false));


--
-- Name: idx_products_on_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_on_sale ON public.products_with_details_core USING btree (max_discount_percentage DESC NULLS LAST) WHERE ((in_stock = true) AND (is_archived = false) AND (on_sale = true) AND (product_type IS NOT NULL) AND (product_type <> ALL (ARRAY['Insurance'::text, 'Shipping'::text])));


--
-- Name: idx_products_price_asc_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_price_asc_composite ON public.products_with_details_core USING btree (min_price, id DESC) WHERE ((in_stock = true) AND (is_archived = false) AND (product_type IS NOT NULL) AND (product_type <> ALL (ARRAY['Insurance'::text, 'Shipping'::text])));


--
-- Name: idx_products_price_desc_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_price_desc_composite ON public.products_with_details_core USING btree (min_price DESC, id DESC) WHERE ((in_stock = true) AND (is_archived = false) AND (product_type IS NOT NULL) AND (product_type <> ALL (ARRAY['Insurance'::text, 'Shipping'::text])));


--
-- Name: idx_products_price_filter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_price_filter ON public.products_with_details_core USING btree (min_price, id) WHERE ((in_stock = true) AND (is_archived = false) AND (product_type IS NOT NULL) AND (product_type <> ALL (ARRAY['Insurance'::text, 'Shipping'::text])));


--
-- Name: idx_products_published_external; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_published_external ON public.products_with_details_core USING btree (published_at_external DESC NULLS LAST, id DESC) WHERE ((in_stock = true) AND (is_archived = false));


--
-- Name: idx_products_size_groups_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_size_groups_gin ON public.products_with_details_core USING gin (size_groups);


--
-- Name: idx_products_size_groups_gin_optimized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_size_groups_gin_optimized ON public.products_with_details_core USING gin (size_groups) WHERE ((in_stock = true) AND (is_archived = false) AND (product_type IS NOT NULL) AND (product_type <> ALL (ARRAY['Insurance'::text, 'Shipping'::text])));


--
-- Name: idx_products_sort_discount_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_sort_discount_desc ON public.products_with_details_core USING btree (max_discount_percentage DESC, created_at DESC, id DESC) WHERE ((in_stock = true) AND (is_archived = false));


--
-- Name: idx_shops_shop_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shops_shop_name ON public.shops USING btree (shop_name);


--
-- Name: idx_size_groups_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_size_groups_sort ON public.size_groups USING btree (sort_order_1, sort_order_2);


--
-- Name: idx_variants_for_grouping; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_for_grouping ON public.variants USING btree (size, product_id, sort_order_1, sort_order_2) WHERE ((size IS NOT NULL) AND (size <> ''::text) AND (available = true));


--
-- Name: idx_variants_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_product_id ON public.variants USING btree (product_id);


--
-- Name: idx_variants_product_size; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_product_size ON public.variants USING btree (product_id, size) WHERE (size IS NOT NULL);


--
-- Name: idx_variants_size; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_size ON public.variants USING btree (size);


--
-- Name: idx_variants_size_available; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_size_available ON public.variants USING btree (size, available);


--
-- Name: idx_variants_size_min_sorting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_size_min_sorting ON public.variants USING btree (size, sort_order_1, sort_order_2) WHERE ((size IS NOT NULL) AND (size <> ''::text) AND (available = true));


--
-- Name: idx_variants_size_product_available; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_size_product_available ON public.variants USING btree (size, product_id, available) INCLUDE (sort_order_1, sort_order_2, price) WHERE (size IS NOT NULL);


--
-- Name: idx_variants_sort_orders; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_sort_orders ON public.variants USING btree (sort_order_1, sort_order_2);


--
-- Name: products_discount_cursor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_discount_cursor_idx ON public.products_with_details_core USING btree (max_discount_percentage DESC NULLS LAST, id DESC) WHERE ((in_stock = true) AND (is_archived = false));


--
-- Name: products_with_details_core_grouped_product_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_with_details_core_grouped_product_type_idx ON public.products_with_details_core USING btree (grouped_product_type);


--
-- Name: products_with_details_core_is_archived_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_with_details_core_is_archived_idx ON public.products_with_details_core USING btree (is_archived);


--
-- Name: products_with_details_core_shop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_with_details_core_shop_id_idx ON public.products_with_details_core USING btree (shop_id);


--
-- Name: variants extract_variant_size_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER extract_variant_size_trigger BEFORE INSERT OR UPDATE ON public.variants FOR EACH ROW EXECUTE FUNCTION public.trigger_extract_variant_size();


--
-- Name: variants maintain_size_groups_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER maintain_size_groups_trigger AFTER INSERT OR DELETE OR UPDATE OF size, sort_order_1, sort_order_2 ON public.variants FOR EACH ROW EXECUTE FUNCTION public.trigger_maintain_size_groups();


--
-- Name: products_with_details_core products_fts_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_fts_trigger BEFORE INSERT OR UPDATE ON public.products_with_details_core FOR EACH ROW EXECUTE FUNCTION public.update_products_fts();


--
-- Name: variants trigger_extract_variant_size; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_extract_variant_size BEFORE INSERT OR UPDATE ON public.variants FOR EACH ROW EXECUTE FUNCTION public.extract_variant_size();


--
-- Name: variants trigger_update_product_size_groups; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_product_size_groups AFTER INSERT OR DELETE OR UPDATE ON public.variants FOR EACH ROW EXECUTE FUNCTION public.update_product_size_groups();


--
-- Name: variants update_product_size_groups_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_product_size_groups_trigger AFTER INSERT OR DELETE OR UPDATE OF size, available ON public.variants FOR EACH ROW EXECUTE FUNCTION public.trigger_update_product_size_groups();


--
-- Name: images images_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.images
    ADD CONSTRAINT images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products_with_details_core(id) ON DELETE CASCADE;


--
-- Name: products_enriched_data products_enriched_data_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products_enriched_data
    ADD CONSTRAINT products_enriched_data_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products_with_details_core(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: variants variants_optimized_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_optimized_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products_with_details_core(id) ON DELETE CASCADE;


--
-- Name: profiles Enable delete for users based on user_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete for users based on user_id" ON public.profiles FOR DELETE USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: images Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users only" ON public.images FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: profiles Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users only" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: shops Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users only" ON public.shops FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: variants Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users only" ON public.variants FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: images Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.images FOR SELECT USING (true);


--
-- Name: products_enriched_data Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.products_enriched_data FOR SELECT USING (true);


--
-- Name: products_with_details_core Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.products_with_details_core FOR SELECT USING (true);


--
-- Name: profiles Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.profiles FOR SELECT USING (true);


--
-- Name: shops Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.shops FOR SELECT USING (true);


--
-- Name: variants Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.variants FOR SELECT USING (true);


--
-- Name: images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;

--
-- Name: products_enriched_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products_enriched_data ENABLE ROW LEVEL SECURITY;

--
-- Name: products_with_details_core; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products_with_details_core ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: shops; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

--
-- Name: size_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.size_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.variants ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict VsLxd8CUjLSlUEf09w8bGUOkuz1ee6XkkRH8oJZzIeBKYbHVXOndn9Nu3txD0Np

