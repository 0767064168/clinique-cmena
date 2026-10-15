CREATE INDEX IF NOT EXISTS idx_produits_pharmacie_actif_designation
    ON produits_pharmacie(designation, id)
    WHERE actif = true;

CREATE OR REPLACE FUNCTION get_pharmacy_products_page(
    p_search TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_stock_alert BOOLEAN DEFAULT false,
    p_expired BOOLEAN DEFAULT false,
    p_today DATE DEFAULT CURRENT_DATE,
    p_page INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 25
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    stock_stats AS (
        SELECT
            COUNT(*) AS total_products,
            COALESCE(SUM(stock_actuel * prix_vente), 0) AS total_stock_value,
            COUNT(*) FILTER (WHERE stock_actuel <= stock_minimum) AS low_stock_products,
            COUNT(*) FILTER (WHERE stock_actuel <= 0) AS out_of_stock_products,
            COUNT(*) FILTER (WHERE date_peremption IS NOT NULL AND date_peremption < p_today) AS expired_products
        FROM produits_pharmacie
        WHERE actif = true
          AND (p_search IS NULL OR designation ILIKE '%' || p_search || '%' OR code ILIKE '%' || p_search || '%')
          AND (p_category IS NULL OR categorie = p_category)
    ),
    filtered_count AS (
        SELECT COUNT(*) AS total_count
        FROM produits_pharmacie
        WHERE actif = true
          AND (p_search IS NULL OR designation ILIKE '%' || p_search || '%' OR code ILIKE '%' || p_search || '%')
          AND (p_category IS NULL OR categorie = p_category)
          AND (NOT p_stock_alert OR stock_actuel <= stock_minimum)
          AND (NOT p_expired OR (date_peremption IS NOT NULL AND date_peremption < p_today))
    ),
    page_rows AS (
        SELECT *
        FROM produits_pharmacie
        WHERE actif = true
          AND (p_search IS NULL OR designation ILIKE '%' || p_search || '%' OR code ILIKE '%' || p_search || '%')
          AND (p_category IS NULL OR categorie = p_category)
          AND (NOT p_stock_alert OR stock_actuel <= stock_minimum)
          AND (NOT p_expired OR (date_peremption IS NOT NULL AND date_peremption < p_today))
        ORDER BY designation ASC, id ASC
        LIMIT LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100)
        OFFSET (LEAST(GREATEST(COALESCE(p_page, 1), 1), 1000000) - 1)
            * LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100)
    )
    SELECT jsonb_build_object(
        'products', COALESCE((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY designation ASC, id ASC) FROM page_rows), '[]'::jsonb),
        'total_count', (SELECT total_count FROM filtered_count),
        'stats', (SELECT jsonb_build_object(
            'totalProduits', total_products,
            'totalValeurStock', total_stock_value,
            'produitsEnAlerte', low_stock_products,
            'produitsEnRupture', out_of_stock_products,
            'produitsPerimes', expired_products
        ) FROM stock_stats)
    );
$$;

GRANT EXECUTE ON FUNCTION get_pharmacy_products_page(TEXT, TEXT, BOOLEAN, BOOLEAN, DATE, INTEGER, INTEGER)
    TO anon, authenticated;
