# Design Doc: 広告セグメントレコメンデーション・マイクロサービス — Groundtruth

**著者:** Ken Oki  
**ステータス:** リリース済み（2024年6月）  
**関連 PRD:** [広告セグメントレコメンデーション機能](./groundtruth-recommendation-prd.md)  
**レビュアー:** バックエンドリード、AI基盤チームリード、DevOps

---

## 概要

Ads Manager（Python/Flask モノリス）のセグメント選択体験を改善するため、独立したレコメンデーション・マイクロサービスを新規構築した。本ドキュメントはアーキテクチャの全設計判断・トレードオフ・実装詳細・運用設計を記述する。

**解決する問題（定量）:**
- セグメント選択ステップの離脱率: 全離脱の 38%（最多ステップ）
- SQL LIKE 検索の P99 レスポンスタイム: 3,200ms
- キャンペーン平均 CTR: 0.48%（業界平均 0.71% を下回る）

**目標（P99 1秒以内 / 離脱 20%削減 / インプレッション 10%向上）:**
- 既存 Flask モノリス内の SQL LIKE 検索では P99 目標を達成できない
- ML エンドポイントへの依存を安全に管理する必要がある
- AI基盤チームとのデプロイ独立性を確保する必要がある

---

## アーキテクチャ全体図

```
┌──────────────────────────────────────────────────────────────────────┐
│ Ads Manager（React + TypeScript、Cloudfront + S3）                    │
│   GET /api/v1/recommendations?userId=xxx&query=retail&limit=5        │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │ HTTPS（Application Load Balancer）
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Recommendation Service（FastAPI / Python 3.11）                       │
│ ECS Fargate（us-east-1）                                              │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ リクエストハンドラ                                             │    │
│  │   1. Redis キャッシュ確認（< 5ms）                            │    │
│  │   2. ユーザー履歴カウント取得（RDS Read Replica）             │    │
│  │   3. 新規 or 経験ユーザーに分岐                               │    │
│  └──────────────────────┬──────────────────────────────────────┘    │
│                          │                                           │
│      ┌───────────────────┴───────────────────────┐                  │
│      │ 文字入力あり                                │ 文字入力なし       │
│      ▼                                           ▼                  │
│  Elasticsearch 検索                 ┌───────────────────────┐       │
│  + 経験ユーザーは ML 並列             │ 新規ユーザー           │       │
│                                     │ Top 5 Popular         │       │
│                                     │ （Redis TTL: 7日）     │       │
│                                     └───────────────────────┘       │
│                                     ┌───────────────────────┐       │
│                                     │ 経験ユーザー           │       │
│                                     │ AI基盤チーム ML        │       │
│                                     │ （最大800ms目標）      │       │
│                                     └───────────┬───────────┘       │
│                                                 │ 失敗時            │
│                                                 └──▶ Top 5 Popular  │
│      └───────────────────────────────────────────────────────────   │
└──────────────────────────────────────────────────────────────────────┘
                    │                        │
          ┌─────────▼──────────┐   ┌────────▼────────┐
          │ ElastiCache Redis  │   │ OpenSearch      │
          │ クラスターモード     │   │ (Elasticsearch) │
          │ cache.t3.medium×2  │   │ t3.medium × 1   │
          └────────────────────┘   └─────────────────┘
                                            │
                                   ┌────────▼────────┐
                                   │ AI 基盤チーム    │
                                   │ LLM エンドポイント│
                                   │ （内部 VPC）     │
                                   └─────────────────┘

月次 cron Lambda（EventBridge）
    └── RDS から上位セグメント集計
    └── S3 に CSV 保存（バックアップ）
    └── Redis 更新（top5_popular キー）
```

---

## SLO / エラーバジェット定義

設計の前提となる SLO を明確化する。

| SLI | SLO | エラーバジェット（30日） |
|-----|-----|----------------------|
| 可用性 | 99.9% | 43.8分/月 |
| P50 レイテンシ | < 200ms | — |
| P99 レイテンシ | < 1,000ms | — |
| ML フォールバック率 | < 5% | — |
| 成功レスポンス率（2xx） | > 99.5% | — |

**エラーバジェットのアラーム設定:**
- 過去 1時間のエラー率 > 0.5% → Slack 通知
- エラーバジェット消費率 > 50%（15日時点） → PagerDuty + ポストモーテム開始

---

## 主要な設計判断

### 1. Flask モノリスへの機能追加 vs 独立マイクロサービス

プロジェクト開始時点での最重要判断。設計ドキュメントを作成し、バックエンドチーム全員でレビューした。

#### 詳細比較

| 観点 | Flask モノリスへの追加（却下） | 独立マイクロサービス（採用） | 差分 |
|------|------------------------------|--------------------------|------|
| **責務分離・検索性能** | Ads Manager 本体に検索・推薦ロジックが混在。既存 SQL LIKE 検索の P99 が 3,200ms | 検索・推薦を独立サービス化し、文字入力時は Elasticsearch 検索とパーソナライズ推薦を並列実行、未入力時は推薦経路に分離 | **P99 1,000ms以内を狙える構成** |
| **デプロイ頻度** | Ads Manager のリリース（月 1〜2回）に縛られる | 独立デプロイ（週 2〜3回を目標） | **イテレーション速度 4〜6倍** |
| **スケーリング** | Ads Manager 全体をスケール。EC2 インスタンス 1台追加で月 $150〜300 | レコメンドサービスのみスケール。Fargate タスク追加で月 $20〜50 | **コスト 75〜85%削減** |
| **障害隔離** | ML・ES・Redis 依存や接続プールなどのリソース問題が Ads Manager 全体に波及 | 推薦サービス単体で隔離・再起動・スケール可能 | **可用性リスク分離** |
| **初期実装コスト** | ECS タスク定義・CI/CD 不要 | 新サービスのインフラ構築 約 2スプリント | **初期コスト +2スプリント** |
| **長期保守コスト** | コードベースの複雑度増加。Flask のコネクションプールに検索エンジンのスレッドが混在 | 独立したコードベースでテストが明確 | **長期的に低コスト** |

**定量判断:**  
既存の SQL LIKE 検索は P99 3,200ms で、目標の 1,000ms を大きく超えていた。文字入力時の検索を Elasticsearch に切り出し、経験ユーザーでは機械学習推薦も並列に実行することで、検索意図とパーソナライズの両方を反映しながら応答時間を抑える構成にした。さらに、文字入力のたびに ML エンドポイントを叩かないよう、キャンペーン単位でほぼ固定の文脈情報をキーにして ML 前段に Redis キャッシュを置いた。

**反論と回答:**  
「マイクロサービスは運用コストが増える」という反論があった。これは正しいが、今回のケースでは Fargate を使うことで OS パッチ・ノード管理が不要になり、実質的な運用増加は「デプロイ設定の追加」程度。チームに既に ECS の運用経験があった点も考慮した。

---

### 2. レイテンシ・バジェット分解

P99 1,000ms の目標をコンポーネントに分解し、各コンポーネントの上限を事前に定義した。

```
P99 1,000ms のバジェット内訳:
├── ネットワーク（クライアント → ALB → ECS）:  30ms
├── Redis キャッシュ確認:                      5ms
├── ユーザー履歴カウント（RDS Read Replica）:   20ms
│
├── ケース A: 新規ユーザー（Redis HIT）
│   └── Redis 読み込み:                        5ms
│       合計:                                 60ms ✅
│
├── ケース B: 新規ユーザー（Redis MISS）
│   └── S3 読み込み（cache-aside）:           200ms
│       合計:                                 255ms ✅
│
├── ケース C: 文字入力あり・未経験ユーザー
│   └── Elasticsearch 検索:                   300ms（P99）
│       合計:                                355ms ✅
│
├── ケース D: 文字入力あり・経験ユーザー
│   ├── personalization cache HIT:
│   │   ├── Elasticsearch 検索:               300ms（P99）
│   │   └── Redis personalization 読み込み:    5ms
│   │       合計:                            355ms ✅
│   ├── personalization cache MISS:
│   ├── ES と ML を並列実行:
│   │   ├── Elasticsearch 検索:               300ms（P99）
│   │   └── ML エンドポイント:                800ms（P99）← ボトルネック
│   ├── レスポンス整形・マージ:                20ms
│   └── Redis への書き込み（非同期）:          非ブロッキング
│       合計:                                875ms ✅
│
└── ケース E: 入力なし・経験ユーザー（Redis MISS）
    ├── ML エンドポイント:                    800ms（P99）← ボトルネック
    ├── レスポンス整形:                       20ms
    └── Redis への書き込み（非同期）:          非ブロッキング
        合計:                                875ms ✅

→ 入力時に ML が失敗した場合は Elasticsearch 検索のみで返す
→ 未入力時に ML が失敗した場合は Top 5 Popular へ切り替える
→ ML タイムアウトを 2,000ms ではなく 800ms 程度に設定しないと目標を達成できない
→ ML チームと「P99 800ms程度」の目標値を交渉・合意した
```

**この分解が設計に与えた影響:**  
文字入力ありの経験ユーザーでは、キャッシュミス時に Elasticsearch 検索と ML 呼び出しを直列にすると 300ms + 800ms = 1,100ms 程度になり、目標の 1,000ms を超える。そこで ES と ML を並列実行し、初回でも最大 800ms 程度で返す設計にした。さらに、キャンペーン作成中は業種・地域・目的・予算などの文脈がほぼ固定なので、その文脈をキーにして ML 前段に Redis キャッシュを置いた。キャッシュヒット時は Elasticsearch 検索が律速になり、約 300ms で返せる。当初 ML タイムアウトを「2秒」に設定していたが、レイテンシバジェット分解により「800ms程度を超えたらタイムアウト」に変更。入力時は Elasticsearch 検索のみで継続し、未入力時は人気上位5件へ切り替える。ML チームとの目標値交渉の根拠にもなった。

---

### 3. 2段階レコメンド戦略の詳細設計

#### 3-1. Top 5 Popular の設計

単純な「使用頻度順」ではなく複合スコアを採用した理由と設計：

```python
# 月次 cron Lambda
import boto3, pandas as pd, json
from datetime import datetime, timedelta
from sqlalchemy import text

async def generate_top5_popular(db_session) -> None:
    """
    スコア = 使用頻度(60%) + 平均CTR正規化値(40%)
    
    「使用頻度だけ」にすると、過去に多用されたが効果の低い
    セグメントが上位に残り続ける問題がある。
    CTRを加重することで「よく使われ、かつ効果的な」セグメントを推薦できる。
    
    CTRの正規化: z-score を使って業界・カテゴリ間のバラつきを補正。
    """
    cutoff = datetime.now() - timedelta(days=30)

    result = await db_session.execute(text("""
        WITH segment_stats AS (
            SELECT
                s.segment_id,
                s.name,
                s.category,
                COUNT(DISTINCT css.campaign_id)                  AS usage_count,
                AVG(c.ctr)                                        AS avg_ctr,
                STDDEV(c.ctr)                                     AS stddev_ctr,
                COUNT(DISTINCT css.campaign_id) FILTER (
                    WHERE c.status = 'completed'
                )                                                 AS completed_count
            FROM segments s
            JOIN campaign_segment_selections css
                ON s.segment_id = css.segment_id
            JOIN campaigns c
                ON css.campaign_id = c.id
            WHERE css.created_at >= :cutoff
              AND c.status IN ('active', 'completed')
            GROUP BY s.segment_id, s.name, s.category
            HAVING COUNT(DISTINCT css.campaign_id) >= 10  -- 最低10件の実績がないと統計的に信頼できない
        ),
        global_ctr_stats AS (
            SELECT AVG(avg_ctr) AS global_mean, STDDEV(avg_ctr) AS global_std
            FROM segment_stats
        )
        SELECT
            ss.segment_id,
            ss.name,
            ss.category,
            ss.usage_count,
            ss.avg_ctr,
            -- 複合スコア: 使用頻度60% + CTR正規化値40%
            (
                0.6 * (ss.usage_count::float / MAX(ss.usage_count) OVER ())
                + 0.4 * (
                    CASE
                        WHEN gcs.global_std = 0 THEN 0
                        ELSE (ss.avg_ctr - gcs.global_mean) / gcs.global_std
                    END
                )
            ) AS composite_score
        FROM segment_stats ss, global_ctr_stats gcs
        ORDER BY composite_score DESC
        LIMIT 5
    """), {"cutoff": cutoff})

    top5 = [dict(row) for row in result.fetchall()]

    # S3 に保存（Redis キャッシュの元データ）
    s3 = boto3.client("s3")
    s3.put_object(
        Bucket="groundtruth-recommendation-data",
        Key=f"top5_popular/{datetime.now().strftime('%Y-%m')}.json",
        Body=json.dumps(top5, default=str),
        ContentType="application/json",
    )

    # Redis に書き込み（cache-aside の初期投入。TTL: 8日）
    redis_client = get_redis_client()
    await redis_client.setex(
        "recommendations:top5_popular",
        ttl=8 * 24 * 3600,
        value=json.dumps(top5),
    )
    logger.info(f"[cron] Top 5 Popular updated: {[s['name'] for s in top5]}")
```

**スコアリングの限界と承認:**  
CTR は広告カテゴリ（CPG vs 不動産）で 5〜10倍の差がある。z-score 正規化でこのバラつきを補正しているが、完全には解決できない。将来は「業界別 Top 5」への分割を検討。この限界は PM にドキュメントとして共有した上で V1 では許容した。

---

#### 3-2. Personalized Suggestions の設計

ML エンドポイントとの契約（OpenAPI spec）を事前合意し、実装の独立性を確保した。

```python
# ML チームとの契約（OpenAPI spec で合意済み）
# POST https://ml-internal.groundtruth.com/v1/segment-recommendations
# Request:
# {
#   "user_id": "usr_12345",
#   "context": {
#     "query": "retail shoppers",      # ユーザーが入力した検索クエリ（optional）
#     "recent_selections": ["seg_A", "seg_B"],  # 直近の選択セグメント ID
#   },
#   "top_k": 5,
#   "exclude_segment_ids": ["seg_X"]   # すでに選択済みのセグメントを除外
# }
# Response:
# {
#   "recommendations": [
#     {
#       "segment_id": "seg_123",
#       "display_name": "Millennial Coffee Enthusiasts",
#       "category": "Lifestyle",
#       "confidence_score": 0.92,
#       "reason": "このターゲットはあなたの過去3キャンペーンで平均CTR 1.2%を達成"
#     }
#   ],
#   "model_version": "v2.1.0",
#   "inference_time_ms": 342
# }

@router.get("/api/v1/recommendations")
async def get_recommendations(
    user_id: str,
    query: Optional[str] = None,
    limit: int = Query(default=5, le=10),
    exclude_segment_ids: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> RecommendationResponse:

    # 1. Redis キャッシュ確認（ユーザー×クエリの組み合わせをキーにする）
    cache_key = f"recs:{user_id}:{hash(query or '')}:{limit}"
    cached = await redis.get(cache_key)
    if cached:
        return RecommendationResponse(**json.loads(cached))

    # 2. ユーザー履歴の確認
    history_count = await get_user_selection_history_count(user_id, db)
    is_new_user = history_count < 3

    # 3. 未経験ユーザー: 文字入力があれば ES 検索、なければ Top 5 Popular
    if is_new_user and query:
        segments = await _search_elasticsearch(query=query, limit=limit)
        response = RecommendationResponse(
            type="search", segments=segments, fallback=False
        )
        await redis.setex(cache_key, 3600, response.json())  # 1時間キャッシュ
        return response

    if is_new_user:
        segments = await _get_top5_popular(redis)
        response = RecommendationResponse(
            type="popular", segments=segments, fallback=False
        )
        await redis.setex(cache_key, 3600, response.json())  # 1時間キャッシュ
        return response

    # 4. 経験ユーザー: 入力有無に関わらず ML に渡す文脈を取得
    recent_selections = await get_recent_selections(user_id, limit=10, db=db)

    # 5. 経験ユーザー + 文字入力あり: ES と personalization cache を並列取得
    if query:
        personalization_cache_key = build_personalization_cache_key(
            user_id=user_id,
            campaign_context=campaign_context,  # 業種・地域・目的・予算など
            recent_selections=recent_selections,
        )

        es_task = asyncio.create_task(
            _search_elasticsearch(query=query, limit=limit * 2)
        )
        personalization_task = asyncio.create_task(
            redis.get(personalization_cache_key)
        )

        es_result, cached_personalization = await asyncio.gather(
            es_task, personalization_task, return_exceptions=True
        )

        if cached_personalization:
            personalization_result = decode_personalization(cached_personalization)
        else:
            # キャッシュミス時だけ ML エンドポイントを呼ぶ。入力ごとには呼ばない。
            try:
                personalization_result = await _call_ml_endpoint(
                    user_id=user_id,
                    query=query,
                    recent_selections=recent_selections,
                    top_k=limit,
                    exclude_segment_ids=exclude_segment_ids,
                )
                await redis.setex(
                    personalization_cache_key,
                    3600,
                    personalization_result.json(),
                )
            except Exception as exc:
                personalization_result = exc

        if isinstance(personalization_result, Exception):
            segments = es_result[:limit] if not isinstance(es_result, Exception) else []
        else:
            segments = _merge_results(
                es_results=es_result if not isinstance(es_result, Exception) else [],
                ml_recommendations=personalization_result.recommendations,
                limit=limit,
            )

        response = RecommendationResponse(
            type="search_personalized",
            segments=segments,
            fallback=isinstance(personalization_result, Exception),  # 入力時は ES のみで継続
        )
        await redis.setex(cache_key, 3600, response.json())
        return response

    # 6. 経験ユーザー + 未入力: ML パーソナライズ推薦
    try:
        ml_result = await _call_ml_endpoint(
            user_id=user_id,
            query=query,
            recent_selections=recent_selections,
            top_k=limit,
            exclude_segment_ids=exclude_segment_ids,
        )
    except Exception as exc:
        ml_result = exc

    # 7. ML 失敗時のフォールバック
    if isinstance(ml_result, Exception):
        logger.warning(
            "ML endpoint fallback",
            extra={
                "error_type": type(ml_result).__name__,
                "user_id": user_id,
                "fallback_to": "top5_popular",
            },
        )
        FALLBACK_COUNTER.inc()  # Prometheus カウンター（フォールバック率の監視用）
        segments = await _get_top5_popular(redis)
        response = RecommendationResponse(
            type="popular", segments=segments, fallback=True
        )
        await redis.setex(cache_key, 300, response.json())  # フォールバック時は短めに5分
        return response

    # 8. ML 結果を返す
    segments = ml_result.recommendations[:limit]

    response = RecommendationResponse(
        type="personalized",
        segments=segments,
        fallback=False,
        model_version=ml_result.model_version,
    )
    await redis.setex(cache_key, 3600, response.json())
    return response


async def _call_ml_endpoint(
    user_id: str,
    query: Optional[str],
    recent_selections: List[str],
    top_k: int,
    exclude_segment_ids: List[str],
) -> MLResponse:
    """
    ML エンドポイントを呼び出す。失敗時は例外をそのまま raise する。
    呼び出し元で捕捉する。入力時は ES のみで継続し、未入力時は人気上位5件へ切り替える。
    """
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=0.5,   # 接続タイムアウト 500ms（ML が死んでいる場合）
            read=2.0,      # 読み取りタイムアウト 2秒（推論時間の上限）
            write=0.5,
            pool=0.1,
        )
    ) as client:
        resp = await client.post(
            settings.ML_ENDPOINT_URL,
            json={
                "user_id": user_id,
                "context": {
                    "query": query,
                    "recent_selections": recent_selections,
                },
                "top_k": top_k,
                "exclude_segment_ids": exclude_segment_ids,
            },
            headers={
                "Authorization": f"Bearer {settings.ML_API_KEY}",
                "X-Request-ID": str(uuid.uuid4()),  # 分散トレーシング用
            },
        )
        resp.raise_for_status()
        return MLResponse(**resp.json())
```

---

### 4. Elasticsearch インデックス設計の詳細

```json
{
  "settings": {
    "number_of_shards": 5,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "segment_name_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": [
            "lowercase",
            "asciifolding",
            "stop",
            "porter_stem"
          ]
        },
        "autocomplete_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "edge_ngram_filter"]
        }
      },
      "filter": {
        "edge_ngram_filter": {
          "type": "edge_ngram",
          "min_gram": 2,
          "max_gram": 15
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "segment_id":     { "type": "keyword" },
      "name": {
        "type": "text",
        "analyzer": "segment_name_analyzer",
        "search_analyzer": "standard",
        "fields": {
          "autocomplete": {
            "type": "text",
            "analyzer": "autocomplete_analyzer",
            "search_analyzer": "standard"
          },
          "raw": { "type": "keyword" }
        }
      },
      "description":    { "type": "text", "analyzer": "segment_name_analyzer" },
      "category":       { "type": "keyword" },
      "subcategory":    { "type": "keyword" },
      "location_type":  { "type": "keyword" },
      "usage_count_30d": { "type": "integer" },
      "avg_ctr":        { "type": "float" },
      "tags":           { "type": "keyword" },
      "updated_at":     { "type": "date" }
    }
  }
}
```

**検索クエリの実装:**

```python
async def _search_elasticsearch(
    query: Optional[str], limit: int
) -> List[ESSegment]:
    if not query:
        # クエリなし: 人気度・CTR でソート
        body = {
            "size": limit,
            "query": {"match_all": {}},
            "sort": [
                {"usage_count_30d": {"order": "desc"}},
                {"avg_ctr": {"order": "desc"}},
            ],
        }
    else:
        # クエリあり: マルチマッチ + 機能スコア
        body = {
            "size": limit,
            "query": {
                "function_score": {
                    "query": {
                        "bool": {
                            "should": [
                                # 完全一致を最優先
                                {
                                    "term": {
                                        "name.raw": {
                                            "value": query,
                                            "boost": 5.0,
                                        }
                                    }
                                },
                                # 前方一致（オートコンプリート）
                                {
                                    "match": {
                                        "name.autocomplete": {
                                            "query": query,
                                            "boost": 3.0,
                                        }
                                    }
                                },
                                # 全文検索
                                {
                                    "multi_match": {
                                        "query": query,
                                        "fields": ["name^3", "description^1", "tags^2"],
                                        "type": "best_fields",
                                        "fuzziness": "AUTO",  # タイポ許容
                                    }
                                },
                            ],
                            "minimum_should_match": 1,
                        }
                    },
                    "functions": [
                        # 使用頻度による加重（log スケールで過大な影響を抑制）
                        {
                            "field_value_factor": {
                                "field": "usage_count_30d",
                                "modifier": "log1p",
                                "factor": 0.3,
                                "missing": 0,
                            }
                        },
                        # CTR による加重
                        {
                            "field_value_factor": {
                                "field": "avg_ctr",
                                "modifier": "sqrt",
                                "factor": 2.0,
                                "missing": 0,
                            }
                        },
                    ],
                    "score_mode": "sum",
                    "boost_mode": "multiply",
                }
            },
        }

    result = await es_client.search(index="segments", body=body)
    return [
        ESSegment(
            segment_id=hit["_source"]["segment_id"],
            name=hit["_source"]["name"],
            category=hit["_source"]["category"],
            score=hit["_score"],
        )
        for hit in result["hits"]["hits"]
    ]
```

**インデックス設計のトレードオフ:**  
`edge_ngram` フィルターによるオートコンプリート対応はインデックスサイズを約 2.5倍にする（3,500件 × 平均フィールドサイズ → 約 50MB → 約 125MB）。OpenSearch の t3.medium（RAM 4GB）では問題ないサイズ。将来 30万件以上になる場合は m6g.large への移行を検討。

---

### 5. Redis キャッシュ設計の詳細

Top 5 Popular は cache-aside 方式で扱う。アプリ側でまず Redis を確認し、MISS の場合だけ S3 から最新データを取得して Redis に載せる。S3 を元データ、Redis を高速化用キャッシュとして分けることで、キャッシュ更新のタイミングをアプリ側で制御しやすくした。

```python
# キャッシュキー設計
CACHE_KEYS = {
    # ユーザー横断の Top 5（全員が参照する）
    "top5_popular": "recommendations:top5_popular",

    # ユーザー×クエリ固有のキャッシュ
    # ユーザー ID + クエリハッシュ で一意性を確保
    "personalized": lambda user_id, query_hash, limit: (
        f"recommendations:personalized:{user_id}:{query_hash}:{limit}"
    ),
}

# TTL 設計の根拠
TTL_CONFIG = {
    # Top 5 Popular: 8日間
    # - 月次バッチで更新（30日ごと）
    # - 上位5件は頻繁に変わらず、即時性も求められない
    # - イベント駆動で即時更新するより、TTL で自然に更新する方が制御しやすい
    # - Redis 障害や MISS 時は S3 から再取得できる
    "top5_popular": 8 * 24 * 3600,

    # パーソナライズ推薦: 1時間
    # - ユーザーが新規キャンペーンを作って新しいセグメントを選択した場合、
    #   1時間以内にキャッシュが更新される体験を担保
    # - ML コール数の削減: 1時間以内の再アクセスが全体の約 40%
    "personalized": 3600,

    # フォールバック時（ML 障害中）: 5分
    # - ML が回復次第、正常な推薦に戻れるよう短めに設定
    "fallback": 300,
}

# キャッシュウォーミング（デプロイ直後のコールドスタート対策）
async def warm_cache_on_startup():
    """
    サービス起動時に Top 5 Popular を S3 から Redis に読み込む。
    Redis が空の状態でトラフィックが来ると全リクエストが DB に直撃する
    （キャッシュスタンピード）ため、起動時にウォーミングする。
    """
    redis = get_redis_client()
    existing = await redis.get("recommendations:top5_popular")
    if existing:
        logger.info("[warmup] Top 5 Popular already in Redis, skip.")
        return

    # S3 から最新データを読み込む
    s3 = boto3.client("s3")
    latest_key = get_latest_s3_key("top5_popular/")  # 最新月のファイルを取得
    obj = s3.get_object(Bucket="groundtruth-recommendation-data", Key=latest_key)
    top5 = json.loads(obj["Body"].read())

    await redis.setex(
        "recommendations:top5_popular",
        ttl=TTL_CONFIG["top5_popular"],
        value=json.dumps(top5),
    )
    logger.info(f"[warmup] Top 5 Popular loaded from S3: {latest_key}")
```

**キャッシュスタンピード対策:**  
人気 user_id のキャッシュが同時に期限切れになると、多数のリクエストが同時に DB / ML に直撃する（キャッシュスタンピード）。TTL に ±300秒のランダムジッターを加えることで分散させる：

```python
jitter = random.randint(-300, 300)
await redis.setex(cache_key, TTL_CONFIG["personalized"] + jitter, value)
```

---

### 6. 検索・推薦のマージ戦略

文字入力ありの経験ユーザーでは、検索結果と推薦結果を同時に使う。Elasticsearch は「ユーザーが今入力した語句に合う候補」を返し、機械学習は「検索クエリ + ユーザー・キャンペーン文脈に合う候補」を返す。機械学習は Elasticsearch の検索結果を待って再ランキングするだけの処理ではなく、独立して推薦候補を返せる経路であるため、両方を並列に実行できる。

ただし、入力ごとに毎回 ML エンドポイントを呼ぶと無駄が大きい。キャンペーン単位で文脈情報がほぼ固定のため、ML 前段に Redis キャッシュを置く。キャッシュヒット時は Elasticsearch 検索とキャッシュ済みパーソナライズ候補をマージする。キャッシュミス時だけ ML エンドポイントを呼び、結果を Redis に保存する。最後にサービス側で重複排除・スコア統合・選択済みセグメント除外を行う。

```text
文字入力あり + 経験ユーザー:
  Elasticsearch 検索 + キャッシュ済みパーソナライズ候補をマージ
  キャッシュミス時だけ機械学習パーソナライズを並列実行
  結果をマージして返す
  機械学習失敗時は Elasticsearch 検索のみで返す

文字入力あり + 未経験ユーザー:
  Elasticsearch 検索

文字入力なし + 経験ユーザー:
  機械学習によるパーソナライズ推薦
  失敗時は人気上位5件へ切り替え

文字入力なし + 未経験ユーザー:
  人気上位5件
```

---

### 7. デプロイ戦略

**Blue/Green + Canary の組み合わせ:**

```
新バージョンのデプロイフロー:
1. CodeDeploy が新タスク定義でタスクを起動（Blue: 既存 / Green: 新規）
2. ALB の重み: Blue 100% → Green 10%（5分間のカナリア観察）
   - Datadog で P99 レイテンシ・エラー率を監視
   - フォールバック率が 2%を超えた場合は自動ロールバック
3. 問題なければ: Green 50% → 100% に段階的移行
4. Blue タスクを停止

ロールバック条件:
- エラー率 > 1%（2分間）
- P99 > 1,500ms（2分間）
- フォールバック率 > 10%（2分間）

ロールバック所要時間: 約 60秒（ECS タスク入れ替え）
```

---

## 容量計画とスケーリング設計

### トラフィック推計

```
現在の Ads Manager の DAU:      約 2,000名
キャンペーン作成 DAU:            約 600名（DAU の 30%）
セグメント選択ステップ到達率:    約 90%
1セッションあたりの検索クエリ:   平均 3.5回

推定 RPS（通常時）:
  600名 × 3.5クエリ / (8時間 × 3600秒) = 0.07 RPS
  ※ピーク時（NY 時間 10:00-11:00）は平均の 4倍 = 0.28 RPS

→ 現在のトラフィックは非常に小さい。
  Fargate 最小 1タスク（0.5 vCPU / 1GB）で十分。
  ただし将来の 10倍スケール（DAU 20,000名）に備えて Auto Scaling 設定を入れる。
```

### スケーリング設定

```hcl
resource "aws_appautoscaling_policy" "recommendation_service" {
  name               = "recommendation-service-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id

  target_tracking_scaling_policy_configuration {
    target_value = 70.0  # CPU 70% でスケールアウト
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    scale_out_cooldown = 60   # スケールアウト後 60秒は追加スケールしない
    scale_in_cooldown  = 300  # スケールイン後 5分は縮小しない（急な縮小防止）
  }
}

# タスク数の上下限
resource "aws_appautoscaling_target" "ecs_target" {
  min_capacity = 1   # 最小 1タスク（コスト削減）
  max_capacity = 10  # 最大 10タスク（DAU 20,000名レベルまで対応）
}
```

---

## 監視・アラート設計

### Datadog ダッシュボード（主要メトリクス）

```python
# カスタムメトリクス（Prometheus → Datadog に転送）
from prometheus_client import Counter, Histogram

REQUEST_LATENCY = Histogram(
    "recommendation_request_duration_seconds",
    "リクエストレイテンシ",
    buckets=[0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0],
    labelnames=["type", "cache_hit"],  # popular/personalized, true/false
)

FALLBACK_COUNTER = Counter(
    "recommendation_ml_fallback_total",
    "ML フォールバック発動回数",
    labelnames=["reason"],  # timeout / http_error / connection_error
)

ML_LATENCY = Histogram(
    "recommendation_ml_endpoint_duration_seconds",
    "ML エンドポイントのレイテンシ",
    buckets=[0.1, 0.3, 0.5, 0.8, 1.0, 2.0],
)

CACHE_HIT_RATE = Counter(
    "recommendation_cache_hits_total",
    "Redis キャッシュヒット",
    labelnames=["cache_type"],  # top5_popular / personalized
)
```

### アラーム設定

| アラーム名 | 条件 | 重大度 | 通知先 |
|-----------|------|--------|--------|
| HighLatency_P99 | P99 > 1,000ms（5分間） | WARNING | Slack #alerts |
| HighLatency_P99_Critical | P99 > 2,000ms（5分間） | CRITICAL | PagerDuty |
| MLFallbackHigh | フォールバック率 > 10%（5分間） | WARNING | Slack #ml-team |
| MLFallbackCritical | フォールバック率 > 30%（5分間） | CRITICAL | PagerDuty |
| ErrorRateHigh | エラー率 > 1%（5分間） | WARNING | Slack #alerts |
| CacheHitRateLow | キャッシュヒット率 < 50%（15分間） | WARNING | Slack #alerts |
| ESClusterRed | OpenSearch cluster status = RED | CRITICAL | PagerDuty |

---

## 障害モード分析

| 障害モード | 検知方法 | 影響範囲 | 対応手順 |
|-----------|---------|---------|---------|
| Redis クラスター停止 | ElastiCache CloudWatch | キャッシュ全消滅。人気上位5件はS3から取得するため応答時間が増加 | 1. cache-asideでS3から取得して継続 2. Redis 復旧後に起動時キャッシュウォーミング実行 |
| ML エンドポイント停止 | フォールバック率アラーム | 文字入力時はElasticsearch検索のみで継続。未入力時のパーソナライズ推薦は Top 5 Popular に劣化 | 1. フォールバックで機能継続 2. AI基盤チームに通知 3. 復旧後にフォールバック率が 0% に戻ることを確認 |
| Elasticsearch 停止 | ES cluster status アラーム | 文字入力時の検索結果が返せない。未入力時の推薦経路は継続 | 1. 検索経路のみエラーまたは空結果として扱う 2. ES 復旧後にインデックス再ビルドの必要性確認 |
| 月次 cron Lambda 失敗 | Lambda エラーアラーム | Top 5 Popular が古くなる（TTL満了までは既存データを利用） | 1. S3の前回データから手動でRedis更新 2. cron Lambda のログを確認・修正・手動実行 |
| ECS タスク OOM | CloudWatch Container Insights | タスクが再起動。一時的なリクエスト失敗 | 1. メモリ割り当てを 1GB → 2GB に増加 2. メモリリークがないか確認 |

---

## 検討したが採用しなかった設計

| 選択肢 | 詳細な非採用理由 |
|--------|----------------|
| PostgreSQL FTS（pg_trgm） | P99 200〜400ms は達成できるが、BM25 スコアリングがなく関連度の品質が低い。将来の k-NN ベクトル検索への移行も困難。インフラコスト差（月 $130〜200）は CTR 改善による広告収益増加で回収可能 |
| GraphQL によるリアルタイム推薦更新 | Subscription でリアルタイム更新のアイデアがあったが、セグメント推薦の「鮮度要件」は分単位ではなく時間単位。REST + キャッシュで十分 |
| DynamoDB（キャッシュ代替） | Redis と比較して P50 レイテンシが 10ms vs 50〜100ms。レイテンシバジェットが厳しい中で Redis が優位 |
| SageMaker エンドポイント（独自推論） | AI基盤チームが既存の LLM エンドポイントを持っており、二重投資になる。バックエンドチームの ML 知識もない |

---

## セキュリティ設計

### VPC 内通信の保護

```
Recommendation Service (ECS)
    │ VPC 内通信のみ（外部からアクセス不可）
    ├── ElastiCache Redis: セキュリティグループで ECS タスクのみ許可
    ├── OpenSearch: セキュリティグループで ECS タスクのみ許可
    └── ML エンドポイント: VPC Peering 経由（インターネット経由でない）

外部からのアクセス:
    Ads Manager → ALB（HTTPS/TLS 1.2+）→ ECS
    └── ALB のセキュリティグループ: Ads Manager の CloudFront Distribution からのみ許可
```

### API 認証

```python
# Ads Manager → Recommendation Service 間の認証
# IAM ベースの署名付きリクエスト（Signature V4）を使用
# 理由: サービス間の mTLS より IAM の方が証明書管理が不要で運用シンプル

@app.middleware("http")
async def verify_aws_signature(request: Request, call_next):
    if not _verify_sigv4_signature(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return await call_next(request)
```

---

## 実績まとめ

| 指標 | 目標 | 実績 |
|------|------|------|
| セグメント選択離脱削減 | 20%削減 | **20%削減達成**（Google Analytics） |
| 広告インプレッション向上 | 10%以上 | **12%向上** |
| 検索 P99 レイテンシ | < 1,000ms | **780ms**（旧: 3,200ms → **76%改善**） |
| キャンペーン平均 CTR | 0.55%（目標） | **0.53%** |
| 実装完了タイミング | Q2 末 | **締め切り 2週間前** |
| ML フォールバック率（本番稼働中） | < 5% | **1.2%**（AI基盤チームの SLA が概ね守られた） |
| Redis キャッシュヒット率 | > 60% | **72%** |
