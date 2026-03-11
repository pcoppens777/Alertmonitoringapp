export enum AssetCategory {
  INDEXES = 'INDEXES',
  STRUCTURAL = 'STRUCTURAL',
  CYCLICAL = 'CYCLICAL',
  RESEARCH = 'RESEARCH',
  RELATIVES = 'RELATIVES',
  SIGNAL = 'SIGNAL',
  DEBUG = 'DEBUG',
}

export interface ChartLayout {
  id: string;
  name: string;
  symbols: string;
  interval?: string;
}

export interface TradingAlert {
  id: string;
  symbol: string;
  category: AssetCategory;
  message: string;
  price: number;
  timestamp: number;
  imageUrl?: string;
}

export interface CategoryGroup {
  name: AssetCategory;
  alerts: TradingAlert[];
}
