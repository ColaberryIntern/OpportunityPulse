/**
 * @swagger
 * components:
 *   schemas:
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: success
 *         message:
 *           type: string
 *         data:
 *           type: object
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: error
 *         message:
 *           type: string
 *         code:
 *           type: integer
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         email:
 *           type: string
 *           format: email
 *         name:
 *           type: string
 *         company:
 *           type: string
 *         interests:
 *           type: string
 *         emailVerified:
 *           type: boolean
 *         roleId:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *     Opportunity:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         type:
 *           type: string
 *           enum: [gov_contract, ai_job, investment]
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         source:
 *           type: string
 *         sourceUrl:
 *           type: string
 *         status:
 *           type: string
 *           enum: [active, closed, expired, archived]
 *         category:
 *           type: string
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         location:
 *           type: string
 *         value:
 *           type: number
 *         aiScore:
 *           type: number
 *         publishedAt:
 *           type: string
 *           format: date-time
 *         expiresAt:
 *           type: string
 *           format: date-time
 *     Content:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         title:
 *           type: string
 *         body:
 *           type: string
 *         category:
 *           type: string
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *         userId:
 *           type: integer
 *     Feedback:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         score:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         comments:
 *           type: string
 *         type:
 *           type: string
 *           enum: [platform, opportunity, content]
 *         status:
 *           type: string
 *           enum: [pending, reviewed, resolved]
 *         targetId:
 *           type: integer
 *         userId:
 *           type: integer
 *     ForumPost:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         title:
 *           type: string
 *         body:
 *           type: string
 *         category:
 *           type: string
 *           enum: [general, gov_contracts, ai_jobs, investments, platform]
 *         status:
 *           type: string
 *           enum: [open, closed, pinned]
 *         viewCount:
 *           type: integer
 *         userId:
 *           type: integer
 *     Comment:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         body:
 *           type: string
 *         userId:
 *           type: integer
 *         forumPostId:
 *           type: integer
 *     Alert:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         type:
 *           type: string
 *           enum: [new_opportunity, score_change, trend_alert, system]
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         severity:
 *           type: string
 *           enum: [info, warning, important]
 *         isRead:
 *           type: boolean
 *         userId:
 *           type: integer
 *     PaginationMeta:
 *       type: object
 *       properties:
 *         page:
 *           type: integer
 *         limit:
 *           type: integer
 *         totalItems:
 *           type: integer
 *         totalPages:
 *           type: integer
 */
