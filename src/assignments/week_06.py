import dash
from dash import dcc, html, Input, Output
import plotly.express as px
import pandas as pd
import numpy as np

# Load or generate sample data here
# For the assignment, you'll want to use real financial data
df = pd.DataFrame({
    'Date': pd.date_range(start='1/1/2025', periods=100),
    'Stock A': np.random.randn(100).cumsum() + 100,
    'Stock B': np.random.randn(100).cumsum() + 100,
    'Sector': np.random.choice(['Tech', 'Finance', 'Energy'], 100)
})

# Initialize the Dash app
app = dash.Dash(__name__, title="Financial Dashboard")

# Define the layout of the dashboard
app.layout = html.Div(
    style={'fontFamily': 'Arial, sans-serif', 'padding': '20px'},
    children=[
        html.H1("Interactive Financial Dashboard", style={'textAlign': 'center'}),
        
        # Interactive Feature 1: Filter
        html.Div([
            html.Label("Select Sector:"),
            dcc.Dropdown(
                id='sector-filter',
                options=[{'label': s, 'value': s} for s in df['Sector'].unique()],
                value='Tech',
                clearable=False
            )
        ], style={'width': '30%', 'display': 'inline-block', 'marginBottom': '20px'}),
        
        # Interactive Feature 2: Date Range Picker (or another parameter)
        html.Div([
            html.Label("Select Date Range:"),
            dcc.DatePickerRange(
                id='date-picker',
                min_date_allowed=df['Date'].min(),
                max_date_allowed=df['Date'].max(),
                start_date=df['Date'].min(),
                end_date=df['Date'].max()
            )
        ], style={'width': '50%', 'display': 'inline-block', 'marginLeft': '5%'}),

        # Layout for Visualizations (Minimum 4 required)
        html.Div([
            # Visualization 1
            html.Div([
                dcc.Graph(id='viz-1')
            ], style={'width': '48%', 'display': 'inline-block'}),
            
            # Visualization 2
            html.Div([
                dcc.Graph(id='viz-2')
            ], style={'width': '48%', 'display': 'inline-block', 'float': 'right'}),
        ]),
        
        html.Div([
            # Visualization 3
            html.Div([
                dcc.Graph(id='viz-3')
            ], style={'width': '48%', 'display': 'inline-block'}),
            
            # Visualization 4
            html.Div([
                dcc.Graph(id='viz-4')
            ], style={'width': '48%', 'display': 'inline-block', 'float': 'right'}),
        ])
    ]
)

# Callback to update visualizations based on interactive features
@app.callback(
    [Output('viz-1', 'figure'),
     Output('viz-2', 'figure'),
     Output('viz-3', 'figure'),
     Output('viz-4', 'figure')],
    [Input('sector-filter', 'value'),
     Input('date-picker', 'start_date'),
     Input('date-picker', 'end_date')]
)
def update_graphs(selected_sector, start_date, end_date):
    # Filter data based on inputs
    filtered_df = df[(df['Sector'] == selected_sector) & 
                     (df['Date'] >= start_date) & 
                     (df['Date'] <= end_date)]
    
    # Visualization 1: Line Chart (e.g., Stock Performance)
    fig1 = px.line(filtered_df, x='Date', y=['Stock A', 'Stock B'], 
                   title=f'Stock Performance in {selected_sector} Sector')
    
    # Visualization 2: Bar Chart (placeholder)
    fig2 = px.bar(filtered_df.head(10), x='Date', y='Stock A', 
                  title='Volume or Metric 2')
    
    # Visualization 3: Scatter Plot (placeholder)
    fig3 = px.scatter(filtered_df, x='Stock A', y='Stock B', 
                      title='Correlation Analysis')
    
    # Visualization 4: Histogram (placeholder)
    fig4 = px.histogram(filtered_df, x='Stock A', 
                        title='Distribution of Returns')
    
    # Ensure consistent styling across figures
    for fig in [fig1, fig2, fig3, fig4]:
        fig.update_layout(template='plotly_white')
        
    return fig1, fig2, fig3, fig4

if __name__ == '__main__':
    # Run the application
    app.run_server(debug=True)
