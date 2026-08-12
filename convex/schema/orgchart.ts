import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const orgchart = {
  orgChartNodes: defineTable({
    organizationId: v.id('organizations'),
    userId: v.optional(v.id('users')), // null for department/group nodes
    parentId: v.optional(v.id('orgChartNodes')),
    name: v.string(), // display name (person or department)
    type: v.union(v.literal('person'), v.literal('department'), v.literal('group')),
    title: v.optional(v.string()), // job title or department name
    avatarUrl: v.optional(v.string()),
    order: v.optional(v.number()), // for sibling ordering
    /**
     * Who created this node. `auto` nodes are rebuilt from the reporting line by
     * `generateOrgChartFromUsers`; `manual` nodes (and legacy nodes with no
     * value) are never touched by it.
     *
     * Before this field existed, regenerating wiped the whole chart, so any
     * hand-made structure — dotted lines, vacancies, planned teams, which the
     * reporting line cannot express — was destroyed on every regenerate.
     */
    source: v.optional(v.union(v.literal('auto'), v.literal('manual'))),
    metadata: v.optional(v.any()), // extra data (location, contact info, etc.)
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_parent', ['organizationId', 'parentId'])
    .index('by_user', ['organizationId', 'userId']),

  orgChartLayouts: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'), // who saved this layout
    layoutData: v.any(), // React Flow layout state (nodes positions, edges)
    name: v.optional(v.string()), // custom layout name
    isDefault: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_user', ['organizationId', 'userId']),
};
